import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { config } from "./config.js";
import { patchAccount, putProfile, readAccountBundle, readProfile, registerAccount } from "./account.js";
import { chooseFallback } from "./fallback.js";
import { hardenDirectorDecision } from "./ai-safety.js";
import {
  acceptCoupleInvite,
  appendCoupleHistory,
  CoupleError,
  createCoupleInvite,
  putCardSignal,
  readCouple,
  readCoupleHistory,
  readPrivateMatches,
  readOwnCardSignal,
  unlinkCouple,
  updateCouplePreferences,
} from "./couples.js";
import {
  chooseWithOpenAI,
  probeOpenAIModel,
} from "./openai-director.js";
import {
  CandidateSchema,
  NextRequestSchema,
  NextResponseSchema,
  type ModelDecision,
  type NextRequest,
  type NextResponse,
} from "./schemas.js";
import {
  checkDirectusReady,
  DirectusRequestError,
  diagnoseAiSettings,
  persistDecision,
  persistResolvedEvent,
  readAiSettings,
} from "./directus.js";
import { SlidingMinuteLimiter } from "./rate-limit.js";
import {
  candidateCompatibilityReasons,
  compatibleCandidates,
} from "./scene-validation.js";

const API_VERSION = "5.0.0";
const limiter = new SlidingMinuteLimiter(config.rateLimitPerMinute);
const accountLimiter = new SlidingMinuteLimiter(config.accountRateLimitPerMinute);
const registerLimiter = new SlidingMinuteLimiter(config.registerRateLimitPerMinute);
const MAX_ATTEMPT_HISTORY = 20;
const MAX_VALIDATION_HISTORY = 20;

interface ValidationFailureRecord {
  request_id: string;
  at: string;
  issues: Array<{ field: string; message: string }>;
  top_level_keys: string[];
  candidate_count: number | null;
  score_sample: Record<string, unknown> | null;
}

const recentValidationFailures: ValidationFailureRecord[] = [];

function requestShapeSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { top_level_keys: [], candidate_count: null, score_sample: null };
  }

  const record = value as Record<string, unknown>;
  const candidates = Array.isArray(record.candidates) ? record.candidates : null;
  const first = candidates?.[0];
  const firstRecord =
    first && typeof first === "object" && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : null;

  return {
    top_level_keys: Object.keys(record).sort(),
    candidate_count: candidates?.length ?? null,
    score_sample: firstRecord
      ? {
          gm_escalation_score: firstRecord.gm_escalation_score ?? null,
          gm_energy_score: firstRecord.gm_energy_score ?? null,
          gm_intimacy_score: firstRecord.gm_intimacy_score ?? null,
          gm_humor_score: firstRecord.gm_humor_score ?? null,
          gm_recovery_score: firstRecord.gm_recovery_score ?? null,
          gm_novelty_score: firstRecord.gm_novelty_score ?? null,
          gm_scene_role: firstRecord.gm_scene_role ?? null,
        }
      : null,
  };
}

function recordValidationFailure(
  requestId: string,
  error: ZodError,
  rawBody: unknown,
) {
  recentValidationFailures.unshift({
    request_id: requestId,
    at: new Date().toISOString(),
    issues: validationIssues(error),
    ...requestShapeSummary(rawBody),
  });
  recentValidationFailures.splice(MAX_VALIDATION_HISTORY);
}


interface FailureInfo {
  code: string;
  reason: string;
  status: number | null;
}

interface ModelAttempt {
  model: string;
  outcome: "success" | "error";
  code: string | null;
  reason: string | null;
  status: number | null;
  latency_ms: number;
}

interface LastAiAttempt {
  state: "never" | "openai" | "local_fallback";
  at: string | null;
  request_id: string | null;
  game_id: string | null;
  session_id: string | null;
  resolved_count: number | null;
  settings_enabled: boolean | null;
  configured_model: string | null;
  attempted_models: string[];
  model_attempts: ModelAttempt[];
  successful_model: string | null;
  code: string | null;
  reason: string | null;
  status: number | null;
  latency_ms: number | null;
}

const emptyAiAttempt = (): LastAiAttempt => ({
  state: "never",
  at: null,
  request_id: null,
  game_id: null,
  session_id: null,
  resolved_count: null,
  settings_enabled: null,
  configured_model: null,
  attempted_models: [],
  model_attempts: [],
  successful_model: null,
  code: null,
  reason: null,
  status: null,
  latency_ms: null,
});

let lastAiAttempt: LastAiAttempt = emptyAiAttempt();
let recentAiAttempts: LastAiAttempt[] = [];

function recordAiAttempt(attempt: LastAiAttempt) {
  lastAiAttempt = attempt;
  recentAiAttempts = [attempt, ...recentAiAttempts].slice(
    0,
    MAX_ATTEMPT_HISTORY,
  );
}

class AiDisabledError extends Error {
  constructor() {
    super("Dirección adaptativa desactivada en pc_ai_settings.");
    this.name = "AiDisabledError";
  }
}

class InvalidModelSelectionError extends Error {
  constructor() {
    super("El modelo eligió una carta fuera de la lista válida.");
    this.name = "InvalidModelSelectionError";
  }
}

class InvalidSceneSelectionError extends Error {
  constructor(readonly reasons: string[]) {
    super(`El modelo eligió una carta incompatible con la escena: ${reasons.join(", ")}.`);
    this.name = "InvalidSceneSelectionError";
  }
}

class NoCompatibleCandidatesError extends Error {
  constructor() {
    super("No quedaron cartas compatibles con el estado actual de la escena.");
    this.name = "NoCompatibleCandidatesError";
  }
}

function originAllowed(origin: string | undefined) {
  if (!origin) return true;
  return config.allowedOrigins.has(origin);
}

function setCors(response: ServerResponse, origin?: string) {
  if (origin && config.allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }

  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Game-Session, X-Game-Draw, X-Diagnostic-Token, Authorization",
  );
  response.setHeader(
    "Access-Control-Expose-Headers",
    "X-Request-ID, X-Game-Master-Version",
  );
  response.setHeader("Access-Control-Max-Age", "600");
}

function json(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readBody(request: IncomingMessage, maxBytes = 1_500_000) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBytes) {
      throw new Error("El cuerpo de la solicitud es demasiado grande.");
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function clientKey(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (
    value?.split(",")[0]?.trim() || request.socket.remoteAddress || "unknown"
  );
}

function headerValue(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function diagnosticAuthorized(request: IncomingMessage) {
  if (!config.diagnosticToken) return false;
  const direct = headerValue(request, "x-diagnostic-token");
  const authorization = headerValue(request, "authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : null;
  return direct === config.diagnosticToken || bearer === config.diagnosticToken;
}

function bearerToken(request: IncomingMessage) {
  const authorization = headerValue(request, "authorization")?.trim();
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

function accountErrorResponse(
  response: ServerResponse,
  requestId: string,
  error: unknown,
) {
  if (error instanceof ZodError) {
    return json(response, 422, {
      error: "Los datos del perfil no son válidos.",
      code: "INVALID_ACCOUNT_PAYLOAD",
      issues: validationIssues(error),
      request_id: requestId,
    });
  }

  if (error instanceof DirectusRequestError) {
    if ([401, 403].includes(error.status)) {
      return json(response, 401, {
        error: "La sesión venció o no es válida.",
        code: "ACCOUNT_UNAUTHORIZED",
        request_id: requestId,
      });
    }

    if (error.status === 404) {
      return json(response, 503, {
        error: "El servicio de perfiles todavía no está instalado.",
        code: "ACCOUNT_PROFILE_NOT_INSTALLED",
        request_id: requestId,
      });
    }

    if (error.status === 503 || error.code === "ACCOUNT_REGISTRATION_NOT_CONFIGURED") {
      return json(response, 503, {
        error: "El registro de cuentas todavía no está configurado en el servidor.",
        code: "ACCOUNT_REGISTRATION_NOT_CONFIGURED",
        request_id: requestId,
      });
    }
  }

  console.error(`[${requestId}] Error de cuenta`, error);
  return json(response, 500, {
    error: "No se pudo completar la operación de cuenta.",
    code: "ACCOUNT_INTERNAL_ERROR",
    request_id: requestId,
  });
}


function coupleErrorResponse(
  response: ServerResponse,
  requestId: string,
  error: unknown,
) {
  if (error instanceof ZodError) {
    return json(response, 422, {
      error: "Los datos de vinculación no son válidos.",
      code: "INVALID_COUPLE_PAYLOAD",
      issues: validationIssues(error),
      request_id: requestId,
    });
  }
  if (error instanceof CoupleError) {
    return json(response, error.status, {
      error: error.message,
      code: error.code,
      request_id: requestId,
    });
  }
  if (error instanceof DirectusRequestError) {
    if ([401, 403].includes(error.status)) {
      return json(response, 401, {
        error: "La sesión venció o no es válida.",
        code: "ACCOUNT_UNAUTHORIZED",
        request_id: requestId,
      });
    }
    if (error.status === 404) {
      return json(response, 503, {
        error: "La vinculación privada todavía no está instalada.",
        code: "COUPLE_SERVICE_NOT_INSTALLED",
        request_id: requestId,
      });
    }
    if (error.code === "RECORD_NOT_UNIQUE" || error.status === 409) {
      return json(response, 409, {
        error: "La cuenta ya está vinculada o la invitación fue utilizada.",
        code: "COUPLE_CONFLICT",
        request_id: requestId,
      });
    }
  }
  console.error(`[${requestId}] Error de pareja`, error);
  return json(response, 500, {
    error: "No se pudo completar la operación de pareja.",
    code: "COUPLE_INTERNAL_ERROR",
    request_id: requestId,
  });
}


function registrationErrorResponse(
  response: ServerResponse,
  requestId: string,
  error: unknown,
) {
  if (error instanceof ZodError) {
    return json(response, 422, {
      error: "Revisá el nombre, apellido y email ingresados.",
      code: "INVALID_REGISTRATION_PAYLOAD",
      issues: validationIssues(error),
      request_id: requestId,
    });
  }

  if (error instanceof DirectusRequestError) {
    if (error.code === "ACCOUNT_REGISTRATION_NOT_CONFIGURED" || error.status === 503) {
      return json(response, 503, {
        error: "El registro de cuentas todavía no está configurado en el servidor.",
        code: "ACCOUNT_REGISTRATION_NOT_CONFIGURED",
        request_id: requestId,
      });
    }

    if ([400, 401, 403, 404, 422].includes(error.status)) {
      console.error(`[${requestId}] Directus rechazó la invitación`, {
        status: error.status,
        code: error.code,
        endpoint: error.endpoint,
      });
      return json(response, 503, {
        error: "No se pudo emitir la invitación. Revisá la configuración de cuentas y correo del servidor.",
        code: "ACCOUNT_INVITATION_UNAVAILABLE",
        request_id: requestId,
      });
    }
  }

  console.error(`[${requestId}] Error de registro`, error);
  return json(response, 500, {
    error: "No se pudo completar el registro.",
    code: "ACCOUNT_REGISTER_INTERNAL_ERROR",
    request_id: requestId,
  });
}

function diagnosticModels(configuredModel?: string | null) {
  return [configuredModel, config.openaiModel, config.openaiFallbackModel]
    .map((value) => String(value || "").trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/sk-[A-Za-z0-9_-]+/g, "[clave oculta]").slice(0, 500);
}

function classifyAiFailure(error: unknown): FailureInfo {
  const status = errorStatus(error);
  const reason = safeErrorMessage(error);
  const lower = reason.toLowerCase();

  if (error instanceof AiDisabledError || lower.includes("desactivada")) {
    return { code: "AI_DISABLED", reason, status };
  }

  if (
    lower.includes("openai_api_key") ||
    lower.includes("api key") && lower.includes("configur")
  ) {
    return { code: "OPENAI_CONFIG", reason, status };
  }

  if (error instanceof InvalidModelSelectionError) {
    return { code: "OPENAI_SELECTION", reason, status };
  }

  if (error instanceof InvalidSceneSelectionError) {
    return { code: "OPENAI_SCENE_SELECTION", reason, status };
  }

  if (error instanceof NoCompatibleCandidatesError) {
    return { code: "NO_COMPATIBLE_CANDIDATES", reason, status };
  }

  if (
    lower.includes("decisión utilizable") ||
    lower.includes("output_parsed") ||
    lower.includes("structured output")
  ) {
    return { code: "OPENAI_OUTPUT", reason, status };
  }

  if (status === 401) return { code: "OPENAI_AUTH", reason, status };
  if (status === 403) return { code: "OPENAI_ACCESS", reason, status };
  if (status === 429) return { code: "OPENAI_RATE_LIMIT", reason, status };

  if (
    status === 404 ||
    ((status === 400 || status === 403) &&
      (lower.includes("model") || lower.includes("modelo")))
  ) {
    return { code: "OPENAI_MODEL", reason, status };
  }

  if (
    status === 408 ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("abort")
  ) {
    return { code: "OPENAI_TIMEOUT", reason, status };
  }

  if (
    lower.includes("network") ||
    lower.includes("connection") ||
    lower.includes("fetch") ||
    lower.includes("econn")
  ) {
    return { code: "OPENAI_NETWORK", reason, status };
  }

  if (status !== null && status >= 500) {
    return { code: "OPENAI_SERVER", reason, status };
  }

  return { code: "OPENAI_ERROR", reason, status };
}

function shouldRetrySameModel(error: unknown): boolean {
  const { code } = classifyAiFailure(error);
  return [
    "OPENAI_OUTPUT",
    "OPENAI_SELECTION",
    "OPENAI_SCENE_SELECTION",
    "OPENAI_NETWORK",
    "OPENAI_SERVER",
    "OPENAI_RATE_LIMIT",
    "OPENAI_ERROR",
  ].includes(code);
}

function shouldTryFallbackModel(error: unknown): boolean {
  const status = errorStatus(error);

  if (status === 401 || error instanceof AiDisabledError) return false;

  if (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status !== null && status >= 500)
  ) {
    return true;
  }

  const code = classifyAiFailure(error).code;
  return [
    "OPENAI_OUTPUT",
    "OPENAI_SELECTION",
    "OPENAI_TIMEOUT",
    "OPENAI_NETWORK",
    "OPENAI_SERVER",
    "OPENAI_RATE_LIMIT",
    "OPENAI_ERROR",
    "OPENAI_MODEL",
  ].includes(code);
}

function validationIssues(error: ZodError) {
  return error.issues.slice(0, 20).map((issue) => ({
    field: issue.path.length ? issue.path.map(String).join(".") : "request",
    message: issue.message,
  }));
}

async function chooseValidDecision(
  requestBody: NextRequest,
  model: string,
  timeoutMs: number,
  customPrompt: string | null,
  attemptedModels: string[],
  modelAttempts: ModelAttempt[],
): Promise<ModelDecision> {
  const startedAt = Date.now();
  attemptedModels.push(model);

  try {
    const decision = await chooseWithOpenAI(requestBody, {
      model,
      timeoutMs,
      customPrompt,
    });

    const selectedCandidate = requestBody.candidates.find(
      (card) => card.id === decision.selected_card_id,
    );
    if (!selectedCandidate) {
      throw new InvalidModelSelectionError();
    }

    const incompatibilities = candidateCompatibilityReasons(
      requestBody,
      selectedCandidate,
    );
    if (incompatibilities.length > 0) {
      throw new InvalidSceneSelectionError(incompatibilities);
    }

    modelAttempts.push({
      model,
      outcome: "success",
      code: null,
      reason: null,
      status: null,
      latency_ms: Date.now() - startedAt,
    });
    return hardenDirectorDecision(decision, requestBody, selectedCandidate);
  } catch (error) {
    const failure = classifyAiFailure(error);
    modelAttempts.push({
      model,
      outcome: "error",
      code: failure.code,
      reason: failure.reason,
      status: failure.status,
      latency_ms: Date.now() - startedAt,
    });
    throw error;
  }
}

const server = createServer(async (request, response) => {
  const requestId = randomUUID();
  const origin =
    typeof request.headers.origin === "string"
      ? request.headers.origin
      : undefined;
  const requestUrl = new URL(request.url ?? "/", "http://localhost");

  setCors(response, origin);
  response.setHeader("X-Request-ID", requestId);
  response.setHeader("X-Game-Master-Version", API_VERSION);

  if (!originAllowed(origin)) {
    return json(response, 403, {
      error: "Origen no permitido.",
      request_id: requestId,
    });
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    return response.end();
  }

  const requestedSessionId = requestUrl.searchParams.get("session_id");
  const attemptHistory = requestedSessionId
    ? recentAiAttempts.filter(
        (attempt) => attempt.session_id === requestedSessionId,
      )
    : recentAiAttempts;
  const recentSummary = {
    total: attemptHistory.length,
    openai: attemptHistory.filter((attempt) => attempt.state === "openai").length,
    local_fallback: attemptHistory.filter(
      (attempt) => attempt.state === "local_fallback",
    ).length,
  };

  if (request.method === "GET" && requestUrl.pathname === "/ready") {
    const directus = await checkDirectusReady();
    return json(response, directus.ok ? 200 : 503, {
      ok: directus.ok,
      ready: directus.ok,
      version: API_VERSION,
      api_version: API_VERSION,
      openai_configured: Boolean(config.openaiApiKey),
      directus,
    });
  }

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    return json(response, 200, {
      ok: true,
      game_master: true,
      version: API_VERSION,
      api_version: API_VERSION,
      request_contract: "v8-hardened-scene",
      openai_configured: Boolean(config.openaiApiKey),
      primary_model: config.openaiModel,
      fallback_model: config.openaiFallbackModel,
      request_timeout_ms: config.requestTimeoutMs,
      diagnostics_enabled: Boolean(config.diagnosticToken),
      allowed_origins: [...config.allowedOrigins],
      last_ai_attempt: lastAiAttempt,
      recent_summary: recentSummary,
    });
  }

  if (request.method === "GET" && requestUrl.pathname === "/health/ai") {
    return json(response, 200, {
      ok: lastAiAttempt.state === "openai",
      api_version: API_VERSION,
      note:
        lastAiAttempt.state === "never"
          ? "Iniciá una partida y volvé a consultar este endpoint."
          : "Se muestran el último intento y hasta 20 decisiones recientes.",
      session_filter: requestedSessionId,
      last_ai_attempt: lastAiAttempt,
      recent_summary: recentSummary,
      recent_ai_attempts: attemptHistory.slice(0, MAX_ATTEMPT_HISTORY),
    });
  }

  if (request.method === "POST" && requestUrl.pathname === "/v1/account/register") {
    const key = clientKey(request);
    if (!registerLimiter.allow(key)) {
      return json(response, 429, {
        error: "Demasiadas solicitudes de registro. Esperá unos minutos.",
        code: "ACCOUNT_REGISTER_RATE_LIMIT",
        request_id: requestId,
      });
    }

    try {
      const body = await readBody(request, 20_000);
      await registerAccount(body);
      return json(response, 202, {
        data: { accepted: true },
        message: "Si el email puede registrarse, recibirás una invitación para activar la cuenta.",
      });
    } catch (error) {
      return registrationErrorResponse(response, requestId, error);
    }
  }

  if (requestUrl.pathname.startsWith("/v1/account/")) {
    const token = bearerToken(request);
    if (!token) {
      return json(response, 401, {
        error: "Falta el token de sesión.",
        code: "ACCOUNT_UNAUTHORIZED",
        request_id: requestId,
      });
    }

    if (!accountLimiter.allow(`${clientKey(request)}:${token.slice(-16)}`)) {
      return json(response, 429, {
        error: "Demasiadas solicitudes de cuenta.",
        code: "ACCOUNT_RATE_LIMIT",
        request_id: requestId,
      });
    }

    try {
      if (request.method === "GET" && requestUrl.pathname === "/v1/account/me") {
        const data = await readAccountBundle(token);
        return json(response, 200, { data });
      }

      if (request.method === "PATCH" && requestUrl.pathname === "/v1/account/me") {
        const body = await readBody(request, 20_000);
        const user = await patchAccount(token, body);
        return json(response, 200, { data: user });
      }

      if (request.method === "GET" && requestUrl.pathname === "/v1/account/profile") {
        const profile = await readProfile(token);
        return json(response, 200, { data: profile });
      }

      if (request.method === "PUT" && requestUrl.pathname === "/v1/account/profile") {
        const body = await readBody(request, 100_000);
        const profile = await putProfile(token, body);
        return json(response, 200, { data: profile });
      }

      return json(response, 405, {
        error: "Método no permitido para esta ruta de cuenta.",
        code: "ACCOUNT_METHOD_NOT_ALLOWED",
        request_id: requestId,
      });
    } catch (error) {
      return accountErrorResponse(response, requestId, error);
    }
  }

  if (requestUrl.pathname.startsWith("/v1/couples")) {
    const token = bearerToken(request);
    if (!token) {
      return json(response, 401, {
        error: "Falta el token de sesión.",
        code: "ACCOUNT_UNAUTHORIZED",
        request_id: requestId,
      });
    }
    if (!accountLimiter.allow(`${clientKey(request)}:${token.slice(-16)}:couple`)) {
      return json(response, 429, {
        error: "Demasiadas solicitudes de vinculación.",
        code: "COUPLE_RATE_LIMIT",
        request_id: requestId,
      });
    }

    try {
      if (request.method === "GET" && requestUrl.pathname === "/v1/couples/me") {
        return json(response, 200, { data: await readCouple(token) });
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/couples/invites") {
        return json(response, 201, { data: await createCoupleInvite(token, await readBody(request, 20_000)) });
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/couples/link") {
        return json(response, 201, { data: await acceptCoupleInvite(token, await readBody(request, 20_000)) });
      }
      if (request.method === "PUT" && requestUrl.pathname === "/v1/couples/preferences") {
        return json(response, 200, { data: await updateCouplePreferences(token, await readBody(request, 100_000)) });
      }
      if (request.method === "DELETE" && requestUrl.pathname === "/v1/couples/me") {
        return json(response, 200, { data: await unlinkCouple(token) });
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/couples/matches") {
        return json(response, 200, { data: await readPrivateMatches(token) });
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/couples/history") {
        return json(response, 200, { data: await readCoupleHistory(token) });
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/couples/history") {
        return json(response, 201, { data: await appendCoupleHistory(token, await readBody(request, 100_000)) });
      }
      const signalMatch = /^\/v1\/couples\/cards\/([^/]+)$/.exec(requestUrl.pathname);
      if (request.method === "GET" && signalMatch) {
        return json(response, 200, {
          data: await readOwnCardSignal(token, decodeURIComponent(signalMatch[1]!)),
        });
      }
      if (request.method === "PUT" && signalMatch) {
        return json(response, 200, {
          data: await putCardSignal(token, decodeURIComponent(signalMatch[1]!), await readBody(request, 20_000)),
        });
      }
      return json(response, 405, {
        error: "Método no permitido para esta ruta de pareja.",
        code: "COUPLE_METHOD_NOT_ALLOWED",
        request_id: requestId,
      });
    } catch (error) {
      return coupleErrorResponse(response, requestId, error);
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/diagnostics/contract") {
    if (!config.diagnosticToken) {
      return json(response, 503, {
        ok: false,
        code: "DIAGNOSTICS_DISABLED",
        error: "DIAGNOSTIC_TOKEN no está configurado en el servicio.",
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    if (!diagnosticAuthorized(request)) {
      return json(response, 401, {
        ok: false,
        code: "DIAGNOSTICS_UNAUTHORIZED",
        error: "Token de diagnóstico incorrecto o ausente.",
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    const requestedFailureId = requestUrl.searchParams.get("request_id");
    const selectedFailure = requestedFailureId
      ? recentValidationFailures.find(
          (failure) => failure.request_id === requestedFailureId,
        ) ?? null
      : recentValidationFailures[0] ?? null;

    const normalizedExample = CandidateSchema.parse({
      id: "diagnostic-card",
      code: "DIAG-001",
      text: "Carta de diagnóstico del contrato.",
      intensity: 7,
      gm_escalation_score: 9,
      gm_energy_score: 9,
      gm_intimacy_score: 8,
      gm_humor_score: 0,
      gm_recovery_score: 5,
      gm_novelty_score: 5,
      gm_scene_role: "escalation",
    });

    return json(response, 200, {
      ok: true,
      api_version: API_VERSION,
      request_id: requestId,
      request_contract: "v8-hardened-scene",
      accepted_input_ranges: {
        gm_escalation_score: [-10, 10],
        gm_energy_score: [0, 10],
        gm_intimacy_score: [0, 10],
        gm_humor_score: [0, 10],
        gm_recovery_score: [0, 10],
        gm_novelty_score: [0, 10],
      },
      normalized_example: {
        gm_escalation_score: normalizedExample.gm_escalation_score,
        gm_energy_score: normalizedExample.gm_energy_score,
        gm_intimacy_score: normalizedExample.gm_intimacy_score,
        gm_scene_role_input: "escalation",
        gm_scene_role: normalizedExample.gm_scene_role,
      },
      scene_role_contract: {
        canonical_roles: [
          "starter",
          "bridge",
          "continuation",
          "climax",
          "recovery",
          "closer",
        ],
        accepts_legacy_aliases: true,
        accepts_unknown_values: true,
        unknown_value_policy: "infer_from_level_intensity_and_scores",
      },
      requested_failure_id: requestedFailureId,
      validation_failure: selectedFailure,
      recent_validation_failures: recentValidationFailures.slice(0, 5),
    });
  }

  if (request.method === "GET" && requestUrl.pathname === "/diagnostics/ai") {
    if (!config.diagnosticToken) {
      return json(response, 503, {
        ok: false,
        code: "DIAGNOSTICS_DISABLED",
        error: "DIAGNOSTIC_TOKEN no está configurado en el servicio.",
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    if (!diagnosticAuthorized(request)) {
      return json(response, 401, {
        ok: false,
        code: "DIAGNOSTICS_UNAUTHORIZED",
        error: "Token de diagnóstico incorrecto o ausente.",
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    return json(response, 200, {
      ok: true,
      active_probe_required: true,
      endpoint: "/diagnostics/ai",
      method: "POST",
      api_version: API_VERSION,
      request_id: requestId,
      configuration: {
        openai_configured: Boolean(config.openaiApiKey),
        primary_model: config.openaiModel,
        fallback_model: config.openaiFallbackModel,
        directus_url: config.directusUrl,
        request_timeout_ms: config.requestTimeoutMs,
        allowed_origins: [...config.allowedOrigins],
      },
    });
  }

  if (request.method === "POST" && requestUrl.pathname === "/diagnostics/ai") {
    if (!config.diagnosticToken) {
      return json(response, 503, {
        ok: false,
        code: "DIAGNOSTICS_DISABLED",
        error: "DIAGNOSTIC_TOKEN no está configurado en el servicio.",
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    if (!diagnosticAuthorized(request)) {
      return json(response, 401, {
        ok: false,
        code: "DIAGNOSTICS_UNAUTHORIZED",
        error: "Token de diagnóstico incorrecto o ausente.",
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    let diagnosticBody: { game_id?: string; origin?: string } = {};
    try {
      diagnosticBody = (await readBody(request, 50_000)) as {
        game_id?: string;
        origin?: string;
      };
    } catch (error) {
      return json(response, 400, {
        ok: false,
        code: "INVALID_DIAGNOSTIC_REQUEST",
        error: safeErrorMessage(error),
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    const directus = await checkDirectusReady();
    const aiSettings = await diagnoseAiSettings(diagnosticBody.game_id || null);
    const configuredModel = aiSettings.settings?.model || config.openaiModel;
    const models = diagnosticModels(configuredModel);
    const modelTests: Array<Record<string, unknown>> = [];
    let successfulModel: string | null = null;

    for (const model of models) {
      const started = Date.now();
      try {
        const result = await probeOpenAIModel(model, config.requestTimeoutMs);
        modelTests.push({ ...result, code: null, reason: null, status: null });
        successfulModel = model;
        break;
      } catch (error) {
        const failure = classifyAiFailure(error);
        modelTests.push({
          ok: false,
          model,
          latency_ms: Date.now() - started,
          code: failure.code,
          reason: failure.reason,
          status: failure.status,
        });
      }
    }

    const testedOrigin = String(diagnosticBody.origin || origin || "").replace(/\/+$/, "");
    const originCheck = {
      supplied: testedOrigin || null,
      allowed: testedOrigin ? config.allowedOrigins.has(testedOrigin) : null,
    };
    const aiEnabled =
      !aiSettings.found || aiSettings.settings?.enabled !== false;
    const ok =
      Boolean(successfulModel) && directus.ok && aiSettings.ok && aiEnabled;

    return json(response, ok ? 200 : 503, {
      ok,
      api_version: API_VERSION,
      request_id: requestId,
      checked_at: new Date().toISOString(),
      summary: !aiEnabled
        ? "La conexión existe, pero la IA está desactivada en pc_ai_settings."
        : successfulModel
          ? directus.ok && aiSettings.ok
            ? "La API, el catálogo y OpenAI respondieron correctamente."
            : "OpenAI respondió, pero hay un problema en la conexión o configuración del catálogo."
          : "La API está accesible, pero ningún modelo de OpenAI completó la prueba.",
      configuration: {
        openai_configured: Boolean(config.openaiApiKey),
        primary_model: config.openaiModel,
        fallback_model: config.openaiFallbackModel,
        configured_model: configuredModel,
        request_timeout_ms: config.requestTimeoutMs,
        diagnostics_enabled: true,
      },
      origin: originCheck,
      directus,
      ai_settings: {
        ...aiSettings,
        effective_enabled: aiEnabled,
      },
      openai: {
        ok: Boolean(successfulModel),
        successful_model: successfulModel,
        attempts: modelTests,
      },
      last_ai_attempt: lastAiAttempt,
      recent_summary: recentSummary,
    });
  }

  if (
    request.method !== "POST" ||
    requestUrl.pathname !== "/v1/game-master/next"
  ) {
    return json(response, 404, {
      error: "Ruta no encontrada.",
      request_id: requestId,
    });
  }

  if (!limiter.allow(clientKey(request))) {
    const sessionId = headerValue(request, "x-game-session") ?? null;
    const resolvedCountHeader = headerValue(request, "x-game-draw");
    const resolvedCount = resolvedCountHeader
      ? Number(resolvedCountHeader)
      : null;

    recordAiAttempt({
      ...emptyAiAttempt(),
      state: "local_fallback",
      at: new Date().toISOString(),
      request_id: requestId,
      session_id: sessionId,
      resolved_count: Number.isFinite(resolvedCount) ? resolvedCount : null,
      code: "SERVICE_RATE_LIMIT",
      reason: "El servicio rechazó la solicitud antes de consultar OpenAI.",
      status: 429,
      latency_ms: 0,
    });

    return json(response, 429, {
      error: "Demasiadas solicitudes.",
      code: "SERVICE_RATE_LIMIT",
      request_id: requestId,
    });
  }

  const startedAt = Date.now();
  let rawRequestBody: unknown = null;

  try {
    rawRequestBody = await readBody(request);
    const body = NextRequestSchema.parse(rawRequestBody);
    const settings = await readAiSettings(body.game_id);
    const sceneCompatible = compatibleCandidates(body);
    if (sceneCompatible.length === 0) {
      throw new NoCompatibleCandidatesError();
    }
    const limitedBody: NextRequest = {
      ...body,
      candidates: sceneCompatible.slice(0, settings.candidate_limit),
    };
    const preferredModel = (settings.model || config.openaiModel).trim();
    const fallbackModel = config.openaiFallbackModel.trim();
    const timeoutMs = Math.max(
      settings.decision_timeout_ms || config.requestTimeoutMs,
      config.requestTimeoutMs,
    );
    const attemptedModels: string[] = [];
    const modelAttempts: ModelAttempt[] = [];
    let firstFailure: FailureInfo | null = null;
    let recoveryCode: string | null = null;
    let responseBody: NextResponse;

    try {
      if (!settings.enabled) {
        throw new AiDisabledError();
      }

      let usedModel = preferredModel;
      let decision: ModelDecision | null = null;
      let recoveryError: unknown = null;

      try {
        decision = await chooseValidDecision(
          limitedBody,
          preferredModel,
          timeoutMs,
          settings.director_prompt,
          attemptedModels,
          modelAttempts,
        );
      } catch (primaryError) {
        firstFailure = classifyAiFailure(primaryError);
        recoveryError = primaryError;

        if (shouldRetrySameModel(primaryError)) {
          console.warn(
            `[${requestId}] ${preferredModel} devolvió una decisión transitoria; se reintenta el mismo modelo.`,
            primaryError,
          );

          try {
            decision = await chooseValidDecision(
              limitedBody,
              preferredModel,
              timeoutMs,
              settings.director_prompt,
              attemptedModels,
              modelAttempts,
            );
            recoveryCode = "RECOVERED_WITH_PRIMARY_RETRY";
            recoveryError = null;
          } catch (retryError) {
            recoveryError = retryError;
          }
        }

        if (
          !decision &&
          fallbackModel !== preferredModel &&
          shouldTryFallbackModel(recoveryError)
        ) {
          console.warn(
            `[${requestId}] ${preferredModel} no se recuperó; se prueba ${fallbackModel}.`,
            recoveryError,
          );
          usedModel = fallbackModel;
          decision = await chooseValidDecision(
            limitedBody,
            fallbackModel,
            timeoutMs,
            settings.director_prompt,
            attemptedModels,
            modelAttempts,
          );
          recoveryCode = "RECOVERED_WITH_FALLBACK_MODEL";
        }

        if (!decision) {
          throw recoveryError ?? primaryError;
        }
      }

      const latencyMs = Date.now() - startedAt;
      recordAiAttempt({
        state: "openai",
        at: new Date().toISOString(),
        request_id: requestId,
        game_id: body.game_id,
        session_id: body.session_id,
        resolved_count: body.resolved_count,
        settings_enabled: settings.enabled,
        configured_model: preferredModel,
        attempted_models: attemptedModels,
        model_attempts: modelAttempts,
        successful_model: usedModel,
        code: recoveryCode,
        reason: firstFailure?.reason ?? null,
        status: firstFailure?.status ?? null,
        latency_ms: latencyMs,
      });

      responseBody = NextResponseSchema.parse({
        ...decision,
        host_message: settings.show_host_messages ? decision.host_message : "",
        provider: "openai",
        model: usedModel,
        latency_ms: latencyMs,
        fallback_used: false,
        fallback_code: null,
        fallback_reason: null,
        request_id: requestId,
        api_version: API_VERSION,
      });
    } catch (error) {
      const failure = classifyAiFailure(error);
      const latencyMs = Date.now() - startedAt;
      console.warn(
        `[${requestId}] Se usó selección adaptativa local (${failure.code}): ${failure.reason}`,
      );
      const decision = chooseFallback(limitedBody);

      recordAiAttempt({
        state: "local_fallback",
        at: new Date().toISOString(),
        request_id: requestId,
        game_id: body.game_id,
        session_id: body.session_id,
        resolved_count: body.resolved_count,
        settings_enabled: settings.enabled,
        configured_model: preferredModel,
        attempted_models: attemptedModels,
        model_attempts: modelAttempts,
        successful_model: null,
        code: failure.code,
        reason: failure.reason,
        status: failure.status,
        latency_ms: latencyMs,
      });

      responseBody = NextResponseSchema.parse({
        ...decision,
        host_message: settings.show_host_messages ? decision.host_message : "",
        provider: "adaptive_fallback",
        model: "local-adaptive-v1",
        latency_ms: latencyMs,
        fallback_used: true,
        fallback_code: failure.code,
        fallback_reason: failure.reason,
        request_id: requestId,
        api_version: API_VERSION,
      });
    }

    if (settings.persist_events) {
      await Promise.allSettled([
        persistResolvedEvent(limitedBody),
        persistDecision(limitedBody, responseBody),
      ]);
    }

    return json(response, 200, responseBody);
  } catch (error) {
    console.error(`[${requestId}]`, error);

    if (error instanceof ZodError) {
      const issues = validationIssues(error);
      recordValidationFailure(requestId, error, rawRequestBody);
      return json(response, 422, {
        error: "La solicitud no coincide con el contrato de la dirección adaptativa.",
        code: "INVALID_REQUEST",
        contract_version: "v8-hardened-scene",
        issues,
        request_summary: requestShapeSummary(rawRequestBody),
        request_id: requestId,
      });
    }

    if (error instanceof NoCompatibleCandidatesError) {
      return json(response, 409, {
        error: error.message,
        code: "NO_COMPATIBLE_CANDIDATES",
        request_id: requestId,
      });
    }

    if (error instanceof SyntaxError) {
      return json(response, 400, {
        error: "El cuerpo de la solicitud no contiene JSON válido.",
        code: "INVALID_JSON",
        request_id: requestId,
      });
    }

    return json(response, 500, {
      error: "No se pudo preparar la próxima carta.",
      code: "INTERNAL_ERROR",
      request_id: requestId,
    });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    `Dirección adaptativa ${API_VERSION} escuchando en el puerto ${config.port}.`,
  );
});

function shutdown(signal: string) {
  console.log(`${signal}: cerrando el servicio adaptativo.`);
  server.close((error) => {
    if (error) {
      console.error("No se pudo cerrar el servidor limpiamente.", error);
      process.exitCode = 1;
    }
    process.exit();
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

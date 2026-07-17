import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { config } from "./config.js";
import { chooseFallback } from "./fallback.js";
import { chooseWithOpenAI } from "./openai-director.js";
import {
  NextRequestSchema,
  NextResponseSchema,
  type NextResponse,
} from "./schemas.js";
import {
  persistDecision,
  persistResolvedEvent,
  readAiSettings,
} from "./directus.js";
import { SlidingMinuteLimiter } from "./rate-limit.js";

const API_VERSION = "1.5.2";
const limiter = new SlidingMinuteLimiter(config.rateLimitPerMinute);

interface FailureInfo {
  code: string;
  reason: string;
  status: number | null;
}

interface LastAiAttempt {
  state: "never" | "openai" | "local_fallback";
  at: string | null;
  request_id: string | null;
  game_id: string | null;
  settings_enabled: boolean | null;
  configured_model: string | null;
  attempted_models: string[];
  successful_model: string | null;
  code: string | null;
  reason: string | null;
  status: number | null;
  latency_ms: number | null;
}

let lastAiAttempt: LastAiAttempt = {
  state: "never",
  at: null,
  request_id: null,
  game_id: null,
  settings_enabled: null,
  configured_model: null,
  attempted_models: [],
  successful_model: null,
  code: null,
  reason: null,
  status: null,
  latency_ms: null,
};

class AiDisabledError extends Error {
  constructor() {
    super("Dirección adaptativa desactivada en pc_ai_settings.");
    this.name = "AiDisabledError";
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
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

function shouldTryFallbackModel(error: unknown): boolean {
  const status = errorStatus(error);

  // Una credencial inválida afectará a ambos modelos; no se duplica la espera.
  if (status === 401 || error instanceof AiDisabledError) return false;

  // Errores de modelo, saturación, red o servidor sí justifican probar otra IA.
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

  const message = safeErrorMessage(error).toLowerCase();
  return (
    status === null ||
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("unsupported") ||
    message.includes("does not exist") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("fetch")
  );
}

function validationIssues(error: ZodError) {
  return error.issues.slice(0, 20).map((issue) => ({
    field: issue.path.length ? issue.path.map(String).join(".") : "request",
    message: issue.message,
  }));
}

const server = createServer(async (request, response) => {
  const requestId = randomUUID();
  const origin =
    typeof request.headers.origin === "string"
      ? request.headers.origin
      : undefined;
  const requestUrl = new URL(request.url ?? "/", "http://localhost");

  setCors(response, origin);

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

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    return json(response, 200, {
      ok: true,
      game_master: true,
      api_version: API_VERSION,
      request_contract: "v4-compatible",
      openai_configured: Boolean(config.openaiApiKey),
      primary_model: config.openaiModel,
      fallback_model: config.openaiFallbackModel,
      request_timeout_ms: config.requestTimeoutMs,
      last_ai_attempt: lastAiAttempt,
    });
  }

  if (request.method === "GET" && requestUrl.pathname === "/health/ai") {
    return json(response, 200, {
      ok: lastAiAttempt.state === "openai",
      api_version: API_VERSION,
      note:
        lastAiAttempt.state === "never"
          ? "Iniciá una partida y volvé a consultar este endpoint."
          : "Este estado corresponde al último intento real de una partida.",
      last_ai_attempt: lastAiAttempt,
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
    return json(response, 429, {
      error: "Demasiadas solicitudes.",
      request_id: requestId,
    });
  }

  const startedAt = Date.now();

  try {
    const body = NextRequestSchema.parse(await readBody(request));
    const settings = await readAiSettings(body.game_id);
    const limitedBody = {
      ...body,
      candidates: body.candidates.slice(0, settings.candidate_limit),
    };
    const preferredModel = (settings.model || config.openaiModel).trim();
    const fallbackModel = config.openaiFallbackModel.trim();
    const timeoutMs = Math.max(
      settings.decision_timeout_ms || config.requestTimeoutMs,
      config.requestTimeoutMs,
    );
    const attemptedModels: string[] = [];
    let primaryFailure: FailureInfo | null = null;
    let responseBody: NextResponse;

    try {
      if (!settings.enabled) {
        throw new AiDisabledError();
      }

      let usedModel = preferredModel;
      let decision;

      try {
        attemptedModels.push(preferredModel);
        decision = await chooseWithOpenAI(limitedBody, {
          model: preferredModel,
          timeoutMs,
          customPrompt: settings.director_prompt,
        });
      } catch (primaryError) {
        primaryFailure = classifyAiFailure(primaryError);

        if (
          fallbackModel === preferredModel ||
          !shouldTryFallbackModel(primaryError)
        ) {
          throw primaryError;
        }

        console.warn(
          `[${requestId}] El modelo ${preferredModel} falló; se prueba ${fallbackModel}.`,
          primaryError,
        );
        usedModel = fallbackModel;
        attemptedModels.push(fallbackModel);
        decision = await chooseWithOpenAI(limitedBody, {
          model: fallbackModel,
          timeoutMs,
          customPrompt: settings.director_prompt,
        });
      }

      if (
        !limitedBody.candidates.some(
          (card) => card.id === decision.selected_card_id,
        )
      ) {
        throw new Error("El modelo eligió una carta fuera de la lista válida.");
      }

      const latencyMs = Date.now() - startedAt;
      lastAiAttempt = {
        state: "openai",
        at: new Date().toISOString(),
        request_id: requestId,
        game_id: body.game_id,
        settings_enabled: settings.enabled,
        configured_model: preferredModel,
        attempted_models: attemptedModels,
        successful_model: usedModel,
        code: primaryFailure ? "RECOVERED_WITH_FALLBACK_MODEL" : null,
        reason: primaryFailure?.reason ?? null,
        status: primaryFailure?.status ?? null,
        latency_ms: latencyMs,
      };

      responseBody = NextResponseSchema.parse({
        ...decision,
        host_message: settings.show_host_messages ? decision.host_message : "",
        provider: "openai",
        model: usedModel,
        latency_ms: latencyMs,
        fallback_used: false,
        fallback_code: null,
        fallback_reason: null,
      });
    } catch (error) {
      const failure = classifyAiFailure(error);
      const latencyMs = Date.now() - startedAt;
      console.warn(
        `[${requestId}] Se usó selección adaptativa local (${failure.code}): ${failure.reason}`,
      );
      const decision = chooseFallback(limitedBody);

      lastAiAttempt = {
        state: "local_fallback",
        at: new Date().toISOString(),
        request_id: requestId,
        game_id: body.game_id,
        settings_enabled: settings.enabled,
        configured_model: preferredModel,
        attempted_models: attemptedModels,
        successful_model: null,
        code: failure.code,
        reason: failure.reason,
        status: failure.status,
        latency_ms: latencyMs,
      };

      responseBody = NextResponseSchema.parse({
        ...decision,
        host_message: settings.show_host_messages ? decision.host_message : "",
        provider: "adaptive_fallback",
        model: "local-adaptive-v1",
        latency_ms: latencyMs,
        fallback_used: true,
        fallback_code: failure.code,
        fallback_reason: failure.reason,
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
      return json(response, 422, {
        error: "La solicitud no coincide con el contrato de la dirección adaptativa.",
        code: "INVALID_REQUEST",
        issues: validationIssues(error),
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
  console.log(`Dirección adaptativa ${API_VERSION} escuchando en el puerto ${config.port}.`);
});

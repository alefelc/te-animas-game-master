import { config } from "./config.js";
import type { NextRequest, NextResponse } from "./schemas.js";

interface DirectusEnvelope<T> {
  data: T;
}

interface DirectusErrorPayload {
  errors?: Array<{
    message?: string;
    extensions?: { code?: string };
  }>;
}

export class DirectusRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "DirectusRequestError";
  }
}

function directusError(payload: unknown, status: number, endpoint: string) {
  const parsed = payload as DirectusErrorPayload | null;
  const first = parsed?.errors?.[0];
  const message =
    typeof first?.message === "string" && first.message.trim()
      ? first.message
      : `Directus respondió HTTP ${status}.`;
  const code =
    typeof first?.extensions?.code === "string"
      ? first.extensions.code
      : null;
  return new DirectusRequestError(message, status, code, endpoint);
}

export async function directusAdminRequest<T>(
  endpoint: string,
  init: RequestInit = {},
  token = config.directusToken,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  if (init.body) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  const response = await fetch(`${config.directusUrl}${endpoint}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw directusError(payload, response.status, endpoint);
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as DirectusEnvelope<T>).data;
  }

  return payload as T;
}

export interface DirectusReadiness {
  ok: boolean;
  latency_ms: number;
  reason: string | null;
}

export async function checkDirectusReady(): Promise<DirectusReadiness> {
  const startedAt = Date.now();
  try {
    await directusAdminRequest<{ id: string }>("/users/me?fields=id", {
      signal: AbortSignal.timeout(5_000),
    });
    return { ok: true, latency_ms: Date.now() - startedAt, reason: null };
  } catch (error) {
    return {
      ok: false,
      latency_ms: Date.now() - startedAt,
      reason: error instanceof Error ? error.message.slice(0, 300) : String(error),
    };
  }
}

export interface AccountUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

export interface StoredProfile {
  id: string | number;
  user: string;
  preferences: unknown | null;
  date_created?: string | null;
  date_updated?: string | null;
}

export async function authenticateAccountToken(accessToken: string) {
  const result = await directusAdminRequest<{ id: string }>(
    "/users/me?fields=id",
    { signal: AbortSignal.timeout(7_000) },
    accessToken,
  );

  if (!result?.id) {
    throw new DirectusRequestError(
      "Directus no identificó al usuario autenticado.",
      401,
      "INVALID_CREDENTIALS",
      "/users/me",
    );
  }

  return result.id;
}

export async function readAccountUser(userId: string): Promise<AccountUser> {
  return directusAdminRequest<AccountUser>(
    `/users/${encodeURIComponent(userId)}?fields=id,email,first_name,last_name,status`,
    { signal: AbortSignal.timeout(7_000) },
  );
}

export async function updateAccountUser(
  userId: string,
  data: { first_name: string | null; last_name: string | null },
): Promise<AccountUser> {
  return directusAdminRequest<AccountUser>(
    `/users/${encodeURIComponent(userId)}?fields=id,email,first_name,last_name,status`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(7_000),
    },
  );
}

function profileQuery(userId: string) {
  const params = new URLSearchParams({
    fields: "id,user,preferences,date_created,date_updated",
    limit: "1",
    "filter[user][_eq]": userId,
  });
  return `/items/pc_user_profiles?${params.toString()}`;
}

export async function readAccountProfile(userId: string): Promise<StoredProfile | null> {
  const rows = await directusAdminRequest<StoredProfile[]>(profileQuery(userId), {
    signal: AbortSignal.timeout(7_000),
  });
  return rows[0] ?? null;
}

export async function saveAccountProfile(
  userId: string,
  preferences: unknown | null,
): Promise<StoredProfile> {
  const existing = await readAccountProfile(userId);

  if (existing) {
    return directusAdminRequest<StoredProfile>(
      `/items/pc_user_profiles/${encodeURIComponent(String(existing.id))}?fields=id,user,preferences,date_created,date_updated`,
      {
        method: "PATCH",
        body: JSON.stringify({ preferences }),
        signal: AbortSignal.timeout(7_000),
      },
    );
  }

  try {
    return await directusAdminRequest<StoredProfile>(
      "/items/pc_user_profiles?fields=id,user,preferences,date_created,date_updated",
      {
        method: "POST",
        body: JSON.stringify({ user: userId, preferences }),
        signal: AbortSignal.timeout(7_000),
      },
    );
  } catch (error) {
    // Dos dispositivos pueden intentar crear el perfil por primera vez al mismo
    // tiempo. La restricción UNIQUE en user evita duplicados; en ese caso se
    // vuelve a leer y actualizar el registro ganador.
    if (
      error instanceof DirectusRequestError &&
      (error.code === "RECORD_NOT_UNIQUE" || error.status === 409)
    ) {
      const raced = await readAccountProfile(userId);
      if (raced) {
        return directusAdminRequest<StoredProfile>(
          `/items/pc_user_profiles/${encodeURIComponent(String(raced.id))}?fields=id,user,preferences,date_created,date_updated`,
          {
            method: "PATCH",
            body: JSON.stringify({ preferences }),
            signal: AbortSignal.timeout(7_000),
          },
        );
      }
    }
    throw error;
  }
}

export interface AiSettings {
  enabled: boolean;
  model: string;
  director_prompt: string | null;
  candidate_limit: number;
  decision_timeout_ms: number;
  persist_events: boolean;
  show_host_messages: boolean;
}

const defaultSettings: AiSettings = {
  enabled: true,
  model: config.openaiModel,
  director_prompt: null,
  candidate_limit: 36,
  decision_timeout_ms: config.requestTimeoutMs,
  persist_events: true,
  show_host_messages: true,
};

export async function readAiSettings(gameId: string): Promise<AiSettings> {
  try {
    const params = new URLSearchParams({
      limit: "1",
      fields: [
        "enabled",
        "model",
        "director_prompt",
        "candidate_limit",
        "decision_timeout_ms",
        "persist_events",
        "show_host_messages",
      ].join(","),
      "filter[game][_eq]": gameId,
      "filter[status][_eq]": "published",
    });

    const rows = await directusAdminRequest<Partial<AiSettings>[]>(
      `/items/pc_ai_settings?${params.toString()}`,
    );

    return {
      ...defaultSettings,
      ...(rows[0] ?? {}),
      model: rows[0]?.model || config.openaiModel,
    };
  } catch (error) {
    console.warn(
      "No se pudieron leer los ajustes de dirección adaptativa.",
      error,
    );
    return defaultSettings;
  }
}

async function createIgnoringDuplicate(collection: string, body: unknown) {
  try {
    await directusAdminRequest(`/items/${collection}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (
      error instanceof DirectusRequestError &&
      error.code === "RECORD_NOT_UNIQUE"
    ) {
      return;
    }
    throw error;
  }
}

export async function persistResolvedEvent(requestBody: NextRequest) {
  const event = requestBody.resolved_event;
  if (!event) return;

  await createIgnoringDuplicate("pc_ai_session_events", {
    id: event.id,
    status: "published",
    game: requestBody.game_id,
    session_id: requestBody.session_id,
    event_type: "card_resolved",
    card: event.card_id,
    player_index: event.player_index,
    result: event.result,
    reaction: event.reaction,
    phase: requestBody.current_phase,
    intensity: event.intensity,
    payload: event,
    created_at: event.created_at,
  });
}

export async function persistDecision(
  requestBody: NextRequest,
  response: NextResponse,
) {
  await directusAdminRequest("/items/pc_ai_decisions", {
    method: "POST",
    body: JSON.stringify({
      status: "published",
      game: requestBody.game_id,
      session_id: requestBody.session_id,
      selected_card: response.selected_card_id,
      player_index: requestBody.current_player,
      strategy: response.strategy,
      phase: response.phase,
      target_tension: response.target_tension,
      target_energy: response.target_energy,
      host_message: response.host_message,
      provider: response.provider,
      model: response.model,
      latency_ms: response.latency_ms,
      fallback_used: response.fallback_used,
      payload: response,
      created_at: new Date().toISOString(),
    }),
  });
}

export interface AiSettingsDiagnostic {
  ok: boolean;
  found: boolean;
  game_id: string | null;
  settings: AiSettings | null;
  latency_ms: number;
  reason: string | null;
}

export async function diagnoseAiSettings(
  gameId?: string | null,
): Promise<AiSettingsDiagnostic> {
  const startedAt = Date.now();
  try {
    const params = new URLSearchParams({
      limit: "1",
      fields: [
        "game",
        "enabled",
        "model",
        "director_prompt",
        "candidate_limit",
        "decision_timeout_ms",
        "persist_events",
        "show_host_messages",
        "status",
      ].join(","),
      sort: "-date_updated,-date_created",
    });

    if (gameId) params.set("filter[game][_eq]", gameId);

    const rows = await directusAdminRequest<Array<Partial<AiSettings> & { game?: unknown }>>(
      `/items/pc_ai_settings?${params.toString()}`,
    );
    const row = rows[0];

    if (!row) {
      return {
        ok: true,
        found: false,
        game_id: gameId || null,
        settings: null,
        latency_ms: Date.now() - startedAt,
        reason:
          "No existe un registro de pc_ai_settings; se usarán las variables del servicio.",
      };
    }

    return {
      ok: true,
      found: true,
      game_id:
        typeof row.game === "string" ? row.game : gameId || null,
      settings: {
        ...defaultSettings,
        ...row,
        model: row.model || config.openaiModel,
      },
      latency_ms: Date.now() - startedAt,
      reason: null,
    };
  } catch (error) {
    return {
      ok: false,
      found: false,
      game_id: gameId || null,
      settings: null,
      latency_ms: Date.now() - startedAt,
      reason: error instanceof Error ? error.message.slice(0, 500) : String(error),
    };
  }
}

export interface AccountRegistrationInput {
  email: string;
  first_name: string;
  last_name: string;
}

interface RegistrationUserRow {
  id: string;
  email: string;
  status: string;
  role: string | null;
}

function usersByEmailQuery(email: string) {
  const params = new URLSearchParams({
    fields: "id,email,status,role",
    limit: "1",
    "filter[email][_eq]": email,
  });
  return `/users?${params.toString()}`;
}

export async function inviteAccountUser(input: AccountRegistrationInput): Promise<void> {
  if (!config.playerRoleId) {
    throw new DirectusRequestError(
      "PLAYER_ROLE_ID no está configurado en Game Master.",
      503,
      "ACCOUNT_REGISTRATION_NOT_CONFIGURED",
      "/users/invite",
    );
  }

  const email = input.email.trim().toLowerCase();
  const existingRows = await directusAdminRequest<RegistrationUserRow[]>(usersByEmailQuery(email), {
    signal: AbortSignal.timeout(7_000),
  });
  const existing = existingRows[0] ?? null;

  // Respuesta deliberadamente neutra: no revelamos si el email ya existe.
  if (existing && existing.status !== "invited") return;

  if (!existing) {
    try {
      await directusAdminRequest<{ id: string }>("/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          first_name: input.first_name.trim() || null,
          last_name: input.last_name.trim() || null,
          role: config.playerRoleId,
          status: "invited",
        }),
        signal: AbortSignal.timeout(7_000),
      });
    } catch (error) {
      // Dos solicitudes simultáneas pueden intentar crear el mismo email.
      if (!(error instanceof DirectusRequestError) || (error.code !== "RECORD_NOT_UNIQUE" && error.status !== 409)) {
        throw error;
      }
    }
  }

  await directusAdminRequest<void>("/users/invite", {
    method: "POST",
    body: JSON.stringify({
      email,
      role: config.playerRoleId,
      invite_url: config.accountInviteUrl,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

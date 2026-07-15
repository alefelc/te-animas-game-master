import { config } from './config.js';
import type { NextRequest, NextResponse } from './schemas.js';

async function request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${config.directusToken}`);
  headers.set('Accept', 'application/json');

  if (init.body) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }

  const response = await fetch(`${config.directusUrl}${endpoint}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Directus ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
    );
  }

  return (payload?.data ?? payload) as T;
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
      limit: '1',
      fields: [
        'enabled',
        'model',
        'director_prompt',
        'candidate_limit',
        'decision_timeout_ms',
        'persist_events',
        'show_host_messages',
      ].join(','),
      'filter[game][_eq]': gameId,
      'filter[status][_eq]': 'published',
    });

    const rows = await request<Partial<AiSettings>[]>(
      `/items/pc_ai_settings?${params.toString()}`,
    );

    return {
      ...defaultSettings,
      ...(rows[0] ?? {}),
      model: rows[0]?.model || config.openaiModel,
    };
  } catch (error) {
    console.warn('No se pudieron leer los ajustes del Game Master.', error);
    return defaultSettings;
  }
}

async function createIgnoringDuplicate(collection: string, body: unknown) {
  try {
    await request(`/items/${collection}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('RECORD_NOT_UNIQUE')) throw error;
  }
}

export async function persistResolvedEvent(requestBody: NextRequest) {
  const event = requestBody.resolved_event;
  if (!event) return;

  await createIgnoringDuplicate('pc_ai_session_events', {
    id: event.id,
    status: 'published',
    game: requestBody.game_id,
    session_id: requestBody.session_id,
    event_type: 'card_resolved',
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
  await request('/items/pc_ai_decisions', {
    method: 'POST',
    body: JSON.stringify({
      status: 'published',
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

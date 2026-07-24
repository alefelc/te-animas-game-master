import type { Candidate, ModelDecision, NextRequest } from "./schemas.js";

const ALLOWED_VARIABLES = new Set([
  "player",
  "current_player",
  "actor",
  "actor_object",
  "current_player_object",
  "target",
  "partner",
  "player1",
  "player2",
  "target_object",
]);

const TECHNICAL_LEAKAGE = /\b(?:ia|inteligencia artificial|algoritmos?|filtros?|openai|prompt|modelo|candidate|selected_card_id|request[_ -]?id|api|json|schema|token)\b/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function fallbackMessage(phase: ModelDecision["phase"], playerCount: 1 | 2): string {
  const solo: Record<ModelDecision["phase"], string> = {
    warmup: "{{player}}, empezá sin apuro y prestá atención a tu cuerpo.",
    build: "La intensidad empieza a subir. Seguí a tu ritmo.",
    intimate: "Concentrate en la sensación, no en la velocidad.",
    intense: "Sostené el ritmo y dejá que la excitación crezca.",
    recovery: "Bajá un cambio, respirá y cambiá de zona.",
    peak: "Estás cerca del punto más intenso de la sesión.",
    closing: "Terminá con una última sensación que quieras recordar.",
  };
  const couple: Record<ModelDecision["phase"], string> = {
    warmup: "Arranquen sin apuro. Dejen que la tensión aparezca sola.",
    build: "La partida empieza a tomar temperatura.",
    intimate: "Ahora importa más la conexión que la velocidad.",
    intense: "Sigan el ritmo: todavía no es momento de cortar la escena.",
    recovery: "Bajen un cambio y vuelvan a encontrarse.",
    peak: "Llegó el momento de ir un poco más lejos.",
    closing: "Cierren la partida con una última escena que tenga sentido.",
  };
  return (playerCount === 1 ? solo : couple)[phase];
}

/**
 * El texto del modelo nunca se ejecuta ni se muestra sin postvalidación.
 * Se limita a variables conocidas, se elimina contenido de control y se evita
 * que detalles técnicos rompan la inmersión o filtren implementación interna.
 */
export function sanitizeHostMessage(
  message: string,
  phase: ModelDecision["phase"],
  playerCount: 1 | 2,
): string {
  const fallback = fallbackMessage(phase, playerCount);
  if (typeof message !== "string" || TECHNICAL_LEAKAGE.test(message)) return fallback;

  const sanitized = message
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_token, variable: string) => {
      const normalized = variable.trim();
      return ALLOWED_VARIABLES.has(normalized) ? `{{${normalized}}}` : "";
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140)
    .trim();

  return sanitized.length >= 3 ? sanitized : fallback;
}


export function hardenDirectorDecision(
  decision: ModelDecision,
  request: NextRequest,
  selectedCandidate: Candidate,
): ModelDecision {
  const progress = request.max_cards > 0 ? request.resolved_count / request.max_cards : 0;
  let phase = decision.phase;
  let strategy = decision.strategy;

  if (request.scene_state.climax_reached) {
    phase = "closing";
    strategy = "close_session";
  } else if (selectedCandidate.card_kind === "climax") {
    phase = "peak";
    strategy = "prepare_climax";
  } else if (phase === "closing" || strategy === "close_session") {
    phase = progress >= 0.7 ? "peak" : "intense";
    strategy = progress >= 0.7 ? "prepare_climax" : "continue_scene";
  }

  return {
    ...decision,
    phase,
    strategy,
    host_message: sanitizeHostMessage(decision.host_message, phase, request.player_count),
  };
}

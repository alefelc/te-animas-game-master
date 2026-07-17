import { z } from "zod";

function normalizeFivePointScore(value: number): number {
  if (value <= 5) return Math.max(0, value);
  return Math.min(5, Math.max(1, Math.ceil(value / 2)));
}

function normalizeEscalationScore(value: number): number {
  if (value <= 3) return Math.max(-2, value);
  return Math.min(3, Math.max(-2, Math.round(value / 3)));
}

const fivePointScore = (defaultValue: number) =>
  z.coerce
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(defaultValue)
    .transform(normalizeFivePointScore);

const escalationScore = z.coerce
  .number()
  .int()
  .min(-10)
  .max(10)
  .optional()
  .default(0)
  .transform(normalizeEscalationScore);

export const ReactionSchema = z.enum([
  "liked",
  "too_soft",
  "too_much",
  "repeat_style",
  "change_style",
  "none",
]);

export const ResultSchema = z.enum(["completed", "skipped", "none"]);

export const SceneRoleSchema = z.enum([
  "starter",
  "bridge",
  "continuation",
  "climax",
  "recovery",
  "closer",
]);

export type SceneRole = z.infer<typeof SceneRoleSchema>;

interface SceneRoleContext {
  levelOrder?: number | null;
  intensity?: number | null;
  escalationScore?: number | null;
  recoveryScore?: number | null;
}

const sceneRoleAliases: Record<string, SceneRole> = {
  starter: "starter",
  start: "starter",
  opening: "starter",
  opener: "starter",
  intro: "starter",
  introduction: "starter",
  inicio: "starter",
  inicial: "starter",
  previa: "starter",
  warmup: "starter",
  calentamiento: "starter",

  bridge: "bridge",
  transition: "bridge",
  transitional: "bridge",
  transition_card: "bridge",
  puente: "bridge",
  transicion: "bridge",
  enlace: "bridge",
  escalation: "bridge",
  escalate: "bridge",
  escalada: "bridge",

  continuation: "continuation",
  continue: "continuation",
  continuing: "continuation",
  sustain: "continuation",
  sustained: "continuation",
  development: "continuation",
  develop: "continuation",
  build: "continuation",
  middle: "continuation",
  desarrollo: "continuation",
  continuacion: "continuation",
  continuidad: "continuation",
  accion: "continuation",

  climax: "climax",
  peak: "climax",
  payoff: "climax",
  orgasm: "climax",
  orgasmic: "climax",
  climax_card: "climax",
  pico: "climax",
  orgasmo: "climax",
  culminacion: "climax",

  recovery: "recovery",
  recover: "recovery",
  cooldown: "recovery",
  cool_down: "recovery",
  reset: "recovery",
  aftercare: "recovery",
  descanso: "recovery",
  recuperacion: "recovery",
  cuidado: "recovery",
  pausa: "recovery",

  closer: "closer",
  close: "closer",
  closing: "closer",
  ending: "closer",
  end: "closer",
  finale: "closer",
  finish: "closer",
  cierre: "closer",
  final: "closer",
  terminar: "closer",
};

function sceneRoleToken(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function finiteNumber(
  value: number | null | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeSceneRole(
  value: unknown,
  context: SceneRoleContext = {},
): SceneRole {
  const normalized = sceneRoleToken(value);
  const alias = normalized ? sceneRoleAliases[normalized] : undefined;
  if (alias) return alias;

  const levelOrder = finiteNumber(context.levelOrder, 3);
  const intensity = finiteNumber(context.intensity, levelOrder);
  const escalation = finiteNumber(context.escalationScore, 0);
  const recovery = finiteNumber(context.recoveryScore, 0);

  if (recovery >= 4) return "recovery";
  if (levelOrder >= 7) return "closer";
  if (levelOrder >= 6 || (intensity >= 8 && escalation >= 2)) return "climax";
  if (levelOrder <= 1 || intensity <= 1) return "starter";
  if (levelOrder === 2) return "bridge";
  return "continuation";
}

const CandidateInputSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  text: z.string().min(1).max(1200),
  level_id: z.string().min(1).optional().default("legacy-level"),
  level_order: z.number().int().min(1).max(20).optional().default(1),
  card_type: z.string().min(1).optional().default("action"),
  intensity: z.number().min(0).max(10).optional().default(1),
  play_scope: z.enum(["couple", "solo", "universal"]).optional().default("couple"),
  performer: z.string().optional().default("current_player"),
  target: z.string().optional().default("partner"),
  performer_sex: z.string().nullable().optional().default(null),
  target_sex: z.string().nullable().optional().default(null),
  anatomy_focus: z.string().optional().default("body"),
  anatomy_owner: z.string().optional().default("none"),
  penetration_method: z
    .enum(["none", "dedos", "pija", "juguete"])
    .optional()
    .default("none"),
  reciprocal_action: z.boolean().optional().default(false),
  tags: z.array(z.string()).max(30).optional().default([]),
  gm_escalation_score: escalationScore,
  gm_energy_score: fivePointScore(2),
  gm_intimacy_score: fivePointScore(2),
  gm_humor_score: fivePointScore(0),
  gm_recovery_score: fivePointScore(1),
  gm_novelty_score: fivePointScore(2),
  gm_continuity_group: z.string().nullable().optional().default(null),
  // Se acepta cualquier valor histórico, traducido, vacío o personalizado.
  // El transform final lo convierte a una de las seis etapas canónicas.
  gm_scene_role: z.unknown().optional().default("bridge"),
});

export const CandidateSchema = CandidateInputSchema.transform((candidate) => ({
  ...candidate,
  gm_scene_role: normalizeSceneRole(candidate.gm_scene_role, {
    levelOrder: candidate.level_order,
    intensity: candidate.intensity,
    escalationScore: candidate.gm_escalation_score,
    recoveryScore: candidate.gm_recovery_score,
  }),
}));

export const EventSchema = z.object({
  id: z.string().min(1).max(128),
  card_id: z.string().min(1),
  result: ResultSchema,
  reaction: ReactionSchema,
  player_index: z.number().int().min(0).max(1),
  intensity: z.number().min(0).max(10),
  continuity_group: z.string().nullable().optional().default(null),
  scene_role: z
    .unknown()
    .optional()
    .default(null)
    .transform((value) =>
      value === null || value === undefined
        ? null
        : normalizeSceneRole(value),
    ),
  created_at: z.string().datetime(),
});

export const NextRequestSchema = z.object({
  game_id: z.string().min(1),
  session_id: z.string().min(1).max(128),
  mode_id: z.string().min(1),
  mode_slug: z.string().optional().default(""),
  player_count: z.union([z.literal(1), z.literal(2)]).optional().default(2),
  current_player: z.number().int().min(0).max(1).optional().default(0),
  resolved_count: z.number().int().min(0).max(500).optional().default(0),
  max_cards: z.number().int().min(1).max(500).optional().default(20),
  current_phase: z.string().optional().default("warmup"),
  current_tension: z.number().min(0).max(100).optional().default(15),
  current_energy: z.number().min(0).max(100).optional().default(25),
  selected_level_ids: z.array(z.string()).max(30).optional().default([]),
  selected_deck_ids: z.array(z.string()).max(100).optional().default([]),
  player_sexes: z
    .tuple([z.string().nullable(), z.string().nullable()])
    .optional()
    .default([null, null]),
  current_player_sex: z.string().nullable().optional().default(null),
  partner_sex: z.string().nullable().optional().default(null),
  recently_seen_card_ids: z.array(z.string()).max(500).optional().default([]),
  recently_seen_groups: z.array(z.string()).max(200).optional().default([]),
  recently_seen_anatomy: z.array(z.string()).max(200).optional().default([]),
  selected_toy_slugs: z.array(z.string()).max(50).optional().default([]),
  selected_element_slugs: z.array(z.string()).max(50).optional().default([]),
  recent_events: z.array(EventSchema).max(12).optional().default([]),
  resolved_event: EventSchema.nullable().optional().default(null),
  candidates: z.array(CandidateSchema).min(1).max(60),
});

export const StrategySchema = z.enum([
  "continue_scene",
  "escalate",
  "slow_down",
  "balance_players",
  "intimate_question",
  "humor_break",
  "change_style",
  "prepare_climax",
  "close_session",
]);

export const PhaseSchema = z.enum([
  "warmup",
  "build",
  "intimate",
  "intense",
  "recovery",
  "peak",
  "closing",
]);

export const ModelDecisionSchema = z.object({
  selected_card_id: z.string().min(1),
  phase: PhaseSchema,
  strategy: StrategySchema,
  target_tension: z.number().int().min(0).max(100),
  target_energy: z.number().int().min(0).max(100),
  host_message: z.string().max(140),
  confidence: z.number().min(0).max(1),
});

export const NextResponseSchema = ModelDecisionSchema.extend({
  provider: z.enum(["openai", "adaptive_fallback"]),
  model: z.string(),
  latency_ms: z.number().int().min(0),
  fallback_used: z.boolean(),
  fallback_code: z.string().nullable().optional().default(null),
  fallback_reason: z.string().max(500).nullable().optional().default(null),
  request_id: z.string().nullable().optional().default(null),
  api_version: z.string().nullable().optional().default(null),
});

export type Candidate = z.infer<typeof CandidateSchema>;
export type SessionEvent = z.infer<typeof EventSchema>;
export type NextRequest = z.infer<typeof NextRequestSchema>;
export type ModelDecision = z.infer<typeof ModelDecisionSchema>;
export type NextResponse = z.infer<typeof NextResponseSchema>;

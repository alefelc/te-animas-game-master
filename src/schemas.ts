import { z } from "zod";

export const ReactionSchema = z.enum([
  "liked",
  "too_soft",
  "too_much",
  "repeat_style",
  "change_style",
  "none",
]);

export const ResultSchema = z.enum(["completed", "skipped", "none"]);

export const CandidateSchema = z.object({
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
  gm_escalation_score: z.number().int().min(-2).max(3).optional().default(0),
  gm_energy_score: z.number().int().min(1).max(5).optional().default(2),
  gm_intimacy_score: z.number().int().min(1).max(5).optional().default(2),
  gm_humor_score: z.number().int().min(0).max(5).optional().default(0),
  gm_recovery_score: z.number().int().min(0).max(5).optional().default(1),
  gm_novelty_score: z.number().int().min(1).max(5).optional().default(2),
  gm_continuity_group: z.string().nullable().optional().default(null),
  gm_scene_role: z
    .enum(["starter", "bridge", "continuation", "climax", "recovery", "closer"])
    .optional()
    .default("bridge"),
});

export const EventSchema = z.object({
  id: z.string().min(1).max(128),
  card_id: z.string().min(1),
  result: ResultSchema,
  reaction: ReactionSchema,
  player_index: z.number().int().min(0).max(1),
  intensity: z.number().min(0).max(10),
  continuity_group: z.string().nullable().optional().default(null),
  scene_role: z.string().nullable().optional().default(null),
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

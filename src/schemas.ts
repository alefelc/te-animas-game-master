import { z } from 'zod';

export const ReactionSchema = z.enum([
  'liked',
  'too_soft',
  'too_much',
  'repeat_style',
  'none',
]);

export const ResultSchema = z.enum(['completed', 'skipped', 'none']);

export const CandidateSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  text: z.string().min(1).max(1200),
  level_id: z.string().min(1),
  level_order: z.number().int().min(1).max(20),
  card_type: z.string().min(1),
  intensity: z.number().min(0).max(10),
  performer: z.string(),
  target: z.string(),
  tags: z.array(z.string()).max(20),
  gm_escalation_score: z.number().int().min(-2).max(2),
  gm_energy_score: z.number().int().min(1).max(5),
  gm_intimacy_score: z.number().int().min(1).max(5),
  gm_humor_score: z.number().int().min(0).max(5),
  gm_recovery_score: z.number().int().min(0).max(5),
  gm_novelty_score: z.number().int().min(1).max(5),
  gm_continuity_group: z.string().nullable(),
  gm_scene_role: z.enum([
    'starter',
    'bridge',
    'continuation',
    'climax',
    'recovery',
    'closer',
  ]),
});

export const EventSchema = z.object({
  id: z.string().uuid(),
  card_id: z.string().min(1),
  result: ResultSchema,
  reaction: ReactionSchema,
  player_index: z.number().int().min(0).max(1),
  intensity: z.number().min(0).max(10),
  continuity_group: z.string().nullable(),
  scene_role: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const NextRequestSchema = z.object({
  game_id: z.string().min(1),
  session_id: z.string().uuid(),
  mode_id: z.string().min(1),
  current_player: z.number().int().min(0).max(1),
  resolved_count: z.number().int().min(0).max(500),
  max_cards: z.number().int().min(1).max(500),
  current_phase: z.string().default('warmup'),
  current_tension: z.number().min(0).max(100).default(15),
  current_energy: z.number().min(0).max(100).default(25),
  selected_level_ids: z.array(z.string()).min(1).max(30),
  selected_deck_ids: z.array(z.string()).max(100),
  player_sexes: z.tuple([z.string().nullable(), z.string().nullable()]),
  recent_events: z.array(EventSchema).max(12),
  resolved_event: EventSchema.nullable().optional().default(null),
  candidates: z.array(CandidateSchema).min(1).max(60),
});

export const StrategySchema = z.enum([
  'continue_scene',
  'escalate',
  'slow_down',
  'balance_players',
  'intimate_question',
  'humor_break',
  'prepare_climax',
  'close_session',
]);

export const PhaseSchema = z.enum([
  'warmup',
  'build',
  'intimate',
  'intense',
  'recovery',
  'peak',
  'closing',
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
  provider: z.enum(['openai', 'adaptive_fallback']),
  model: z.string(),
  latency_ms: z.number().int().min(0),
  fallback_used: z.boolean(),
});

export type Candidate = z.infer<typeof CandidateSchema>;
export type SessionEvent = z.infer<typeof EventSchema>;
export type NextRequest = z.infer<typeof NextRequestSchema>;
export type ModelDecision = z.infer<typeof ModelDecisionSchema>;
export type NextResponse = z.infer<typeof NextResponseSchema>;

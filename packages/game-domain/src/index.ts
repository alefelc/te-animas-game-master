import { z } from "zod";

export const SCENE_PHASES = [
  "connection",
  "provocation",
  "contact",
  "nudity",
  "action",
  "intensification",
  "climax",
  "closure",
] as const;

export const PHYSICAL_STATES = [
  "clothed",
  "suggestive",
  "partial_nudity",
  "nude",
  "sexual_activity",
  "climax",
  "aftercare",
] as const;

export const CARD_KINDS = [
  "question",
  "preparation",
  "action",
  "transition",
  "continuity",
  "climax",
  "closure",
] as const;

export const ACTIVITY_ACTIONS = [
  "none",
  "start",
  "continue",
  "intensify",
  "switch",
  "complete",
] as const;

export const INVENTORY_ACTIONS = [
  "none",
  "introduce",
  "prepare",
  "use",
  "continue",
  "replace",
  "remove",
] as const;

export const ScenePhaseSchema = z.enum(SCENE_PHASES);
export const PhysicalStateSchema = z.enum(PHYSICAL_STATES);
export const CardKindSchema = z.enum(CARD_KINDS);
export const ActivityActionSchema = z.enum(ACTIVITY_ACTIONS);
export const InventoryActionSchema = z.enum(INVENTORY_ACTIONS);

export type ScenePhase = z.infer<typeof ScenePhaseSchema>;
export type PhysicalState = z.infer<typeof PhysicalStateSchema>;
export type CardKind = z.infer<typeof CardKindSchema>;
export type ActivityAction = z.infer<typeof ActivityActionSchema>;
export type InventoryAction = z.infer<typeof InventoryActionSchema>;

export const SceneStateSchema = z.object({
  phase: ScenePhaseSchema.default("connection"),
  physical_state: PhysicalStateSchema.default("clothed"),
  active_activity: z.string().max(80).nullable().default(null),
  completed_activities: z.array(z.string().max(80)).max(40).default([]),
  inventory_in_scene: z.array(z.string().max(120)).max(60).default([]),
  climax_reached: z.boolean().default(false),
  consecutive_questions: z.number().int().min(0).max(20).default(0),
  consecutive_actions: z.number().int().min(0).max(100).default(0),
  last_card_kind: CardKindSchema.nullable().default(null),
  last_continuity_group: z.string().max(120).nullable().default(null),
});

export type SceneState = z.infer<typeof SceneStateSchema>;

export interface SceneCandidate {
  id: string;
  intensity: number;
  card_kind: CardKind;
  scene_phase_min: ScenePhase;
  scene_phase_max: ScenePhase;
  scene_phase_after: ScenePhase;
  physical_state_min: PhysicalState;
  physical_state_after: PhysicalState;
  activity_family: string | null;
  activity_action: ActivityAction;
  requires_previous_activity: string | null;
  forbidden_after_activity: string | null;
  allow_activity_change: boolean;
  allow_position_change: boolean;
  allow_rhythm_change: boolean;
  inventory_action: InventoryAction;
  inventory_keys: string[];
  gm_continuity_group: string | null;
  gm_escalation_score: number;
  gm_recovery_score: number;
  gm_novelty_score: number;
  variant_group: string | null;
  cooldown_sessions: number;
}

const phaseOrder = new Map<ScenePhase, number>(
  SCENE_PHASES.map((value, index) => [value, index]),
);
const physicalOrder = new Map<PhysicalState, number>(
  PHYSICAL_STATES.map((value, index) => [value, index]),
);

export function compareScenePhase(a: ScenePhase, b: ScenePhase): number {
  return (phaseOrder.get(a) ?? 0) - (phaseOrder.get(b) ?? 0);
}

export function comparePhysicalState(a: PhysicalState, b: PhysicalState): number {
  return (physicalOrder.get(a) ?? 0) - (physicalOrder.get(b) ?? 0);
}

export function initialSceneState(): SceneState {
  return SceneStateSchema.parse({});
}

export interface CompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

export function checkSceneCompatibility(
  stateInput: SceneState,
  candidate: SceneCandidate,
): CompatibilityResult {
  const state = SceneStateSchema.parse(stateInput ?? {});
  const reasons: string[] = [];

  if (compareScenePhase(state.phase, candidate.scene_phase_min) < 0) {
    reasons.push("phase_too_early");
  }
  if (compareScenePhase(state.phase, candidate.scene_phase_max) > 0) {
    reasons.push("phase_too_late");
  }
  if (comparePhysicalState(state.physical_state, candidate.physical_state_min) < 0) {
    reasons.push("physical_state_too_early");
  }
  if (
    candidate.requires_previous_activity &&
    state.active_activity !== candidate.requires_previous_activity &&
    !state.completed_activities.includes(candidate.requires_previous_activity)
  ) {
    reasons.push("required_activity_missing");
  }
  if (
    candidate.forbidden_after_activity &&
    (state.active_activity === candidate.forbidden_after_activity ||
      state.completed_activities.includes(candidate.forbidden_after_activity))
  ) {
    reasons.push("forbidden_activity_already_occurred");
  }
  if (
    state.active_activity &&
    candidate.activity_family &&
    candidate.activity_family !== state.active_activity &&
    !candidate.allow_activity_change &&
    candidate.activity_action !== "complete"
  ) {
    reasons.push("activity_switch_not_allowed");
  }
  if (
    candidate.inventory_action === "continue" &&
    candidate.inventory_keys.length > 0 &&
    !candidate.inventory_keys.some((key) => state.inventory_in_scene.includes(key))
  ) {
    reasons.push("inventory_not_in_scene");
  }
  if (state.climax_reached && candidate.card_kind !== "closure") {
    reasons.push("post_climax_requires_closure");
  }
  if (state.consecutive_questions >= 2 && candidate.card_kind === "question") {
    reasons.push("question_streak_limit");
  }

  return { compatible: reasons.length === 0, reasons };
}

function unique(values: string[], limit = 40) {
  return [...new Set(values.filter(Boolean))].slice(-limit);
}

export function advanceSceneState(
  stateInput: SceneState,
  candidate: SceneCandidate,
): SceneState {
  const state = SceneStateSchema.parse(stateInput ?? {});
  const completed = [...state.completed_activities];
  let active = state.active_activity;

  if (candidate.activity_action === "complete" && active) {
    completed.push(active);
    active = null;
  } else if (
    candidate.activity_family &&
    ["start", "switch", "continue", "intensify"].includes(candidate.activity_action)
  ) {
    if (candidate.activity_action === "switch" && active && active !== candidate.activity_family) {
      completed.push(active);
    }
    active = candidate.activity_family;
  }

  let inventory = [...state.inventory_in_scene];
  if (["introduce", "prepare", "use", "continue", "replace"].includes(candidate.inventory_action)) {
    inventory = unique([...inventory, ...candidate.inventory_keys], 60);
  }
  if (candidate.inventory_action === "remove") {
    const removed = new Set(candidate.inventory_keys);
    inventory = inventory.filter((key) => !removed.has(key));
  }

  const nextPhase =
    compareScenePhase(candidate.scene_phase_after, state.phase) >= 0
      ? candidate.scene_phase_after
      : state.phase;
  const nextPhysicalState =
    comparePhysicalState(candidate.physical_state_after, state.physical_state) >= 0
      ? candidate.physical_state_after
      : state.physical_state;

  return SceneStateSchema.parse({
    phase: nextPhase,
    physical_state: nextPhysicalState,
    active_activity: active,
    completed_activities: unique(completed),
    inventory_in_scene: inventory,
    climax_reached:
      state.climax_reached ||
      candidate.card_kind === "climax" ||
      candidate.scene_phase_after === "climax",
    consecutive_questions:
      candidate.card_kind === "question" ? state.consecutive_questions + 1 : 0,
    consecutive_actions:
      ["action", "continuity", "climax"].includes(candidate.card_kind)
        ? state.consecutive_actions + 1
        : 0,
    last_card_kind: candidate.card_kind,
    last_continuity_group: candidate.gm_continuity_group,
  });
}

export interface SceneScoreContext {
  progress: number;
  targetIntensity: number;
  recentVariantGroups?: string[];
  recentContinuityGroups?: string[];
  selectedInventory?: string[];
}

export function scoreSceneCandidate(
  stateInput: SceneState,
  candidate: SceneCandidate,
  context: SceneScoreContext,
): number {
  const state = SceneStateSchema.parse(stateInput ?? {});
  const compatibility = checkSceneCompatibility(state, candidate);
  if (!compatibility.compatible) return Number.NEGATIVE_INFINITY;

  const progress = Math.max(0, Math.min(1, context.progress));
  const targetPhaseIndex = Math.min(
    SCENE_PHASES.length - 1,
    Math.floor(progress * SCENE_PHASES.length),
  );
  const candidatePhaseIndex = phaseOrder.get(candidate.scene_phase_after) ?? 0;
  const desiredIntensity = Math.max(1, context.targetIntensity * (0.35 + progress * 0.65));
  let score = 100;

  score -= Math.abs(candidatePhaseIndex - targetPhaseIndex) * 14;
  score -= Math.abs(candidate.intensity - desiredIntensity) * 8;
  score += candidate.gm_novelty_score * 3;
  score += candidate.gm_escalation_score * (progress < 0.82 ? 5 : -2);
  score += candidate.gm_recovery_score * (state.consecutive_actions >= 4 ? 5 : -1);

  if (
    state.active_activity &&
    candidate.activity_family === state.active_activity &&
    ["continue", "intensify"].includes(candidate.activity_action)
  ) {
    score += 32;
  }
  if (
    state.last_continuity_group &&
    candidate.gm_continuity_group === state.last_continuity_group
  ) {
    score += 20;
  }
  if (
    candidate.variant_group &&
    context.recentVariantGroups?.includes(candidate.variant_group)
  ) {
    score -= 80;
  }
  if (
    candidate.gm_continuity_group &&
    context.recentContinuityGroups?.includes(candidate.gm_continuity_group)
  ) {
    score -= 15;
  }
  if (
    candidate.inventory_keys.some((key) => context.selectedInventory?.includes(key))
  ) {
    score += 24;
  }
  if (progress > 0.88 && candidate.card_kind === "closure") score += 70;
  if (progress > 0.72 && candidate.card_kind === "climax") score += 45;
  if (progress < 0.45 && candidate.card_kind === "climax") score -= 120;

  return score;
}

export function normalizeScenePhase(value: unknown, fallback: ScenePhase = "connection"): ScenePhase {
  const token = String(value ?? "").trim().toLowerCase();
  return (SCENE_PHASES as readonly string[]).includes(token)
    ? (token as ScenePhase)
    : fallback;
}

export function normalizePhysicalState(value: unknown, fallback: PhysicalState = "clothed"): PhysicalState {
  const token = String(value ?? "").trim().toLowerCase();
  return (PHYSICAL_STATES as readonly string[]).includes(token)
    ? (token as PhysicalState)
    : fallback;
}

import {
  checkSceneCompatibility,
  type SceneCandidate,
} from "@te-animas/game-domain";
import { CandidateSchema, type Candidate, type NextRequest } from "./schemas.js";

export function toDomainCandidate(candidate: Candidate): SceneCandidate {
  // Tests and older callers may still construct pre-v4 candidates directly.
  // Normalize through the canonical contract so every default is applied before
  // the deterministic scene engine evaluates it.
  const normalized = CandidateSchema.parse(candidate);
  return {
    id: normalized.id,
    intensity: normalized.intensity,
    card_kind: normalized.card_kind,
    scene_phase_min: normalized.scene_phase_min,
    scene_phase_max: normalized.scene_phase_max,
    scene_phase_after: normalized.scene_phase_after,
    physical_state_min: normalized.physical_state_min,
    physical_state_after: normalized.physical_state_after,
    activity_family: normalized.activity_family,
    activity_action: normalized.activity_action,
    requires_previous_activity: normalized.requires_previous_activity,
    forbidden_after_activity: normalized.forbidden_after_activity,
    allow_activity_change: normalized.allow_activity_change,
    allow_position_change: normalized.allow_position_change,
    allow_rhythm_change: normalized.allow_rhythm_change,
    inventory_action: normalized.inventory_action,
    inventory_keys: [
      ...normalized.element_slugs.map((slug) => `element:${slug}`),
      ...normalized.toy_slugs.map((slug) => `toy:${slug}`),
    ],
    gm_continuity_group: normalized.gm_continuity_group,
    gm_escalation_score: normalized.gm_escalation_score,
    gm_recovery_score: normalized.gm_recovery_score,
    gm_novelty_score: normalized.gm_novelty_score,
    variant_group: normalized.variant_group,
    cooldown_sessions: normalized.cooldown_sessions,
  };
}

export function compatibleCandidates(request: NextRequest): Candidate[] {
  return request.candidates.filter(
    (candidate) =>
      checkSceneCompatibility(
        request.scene_state,
        toDomainCandidate(candidate),
      ).compatible,
  );
}

export function candidateCompatibilityReasons(
  request: NextRequest,
  candidate: Candidate,
): string[] {
  return checkSceneCompatibility(
    request.scene_state,
    toDomainCandidate(candidate),
  ).reasons;
}

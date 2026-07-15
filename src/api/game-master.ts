import { z } from 'zod';
import { env } from '../env';
import type {
  Card,
  ContentBundle,
  GameMasterEvent,
  GameSetup,
  SessionState,
} from '../types';

const responseSchema = z.object({
  selected_card_id: z.string(),
  phase: z.string(),
  strategy: z.string(),
  target_tension: z.number(),
  target_energy: z.number(),
  host_message: z.string(),
  confidence: z.number(),
  provider: z.enum(['openai', 'adaptive_fallback']),
  model: z.string(),
  latency_ms: z.number(),
  fallback_used: z.boolean(),
});

export type GameMasterDecision = z.infer<typeof responseSchema>;

function tagSlugsForCard(content: ContentBundle, cardId: string) {
  const tagIds = content.cardTags
    .filter((row) => row.card === cardId)
    .map((row) => row.tag);

  const selected = new Set(tagIds);
  return content.tags
    .filter((tag) => selected.has(tag.id))
    .map((tag) => tag.slug);
}

function sexSlug(content: ContentBundle, sexId: string | null) {
  return content.sexes.find((sex) => sex.id === sexId)?.slug ?? null;
}

function eventPayload(event: GameMasterEvent) {
  return {
    id: event.id,
    card_id: event.cardId,
    result: event.result,
    reaction: event.reaction,
    player_index: event.playerIndex,
    intensity: event.intensity,
    continuity_group: event.continuityGroup,
    scene_role: event.sceneRole,
    created_at: event.createdAt,
  };
}

function candidatePayload(content: ContentBundle, card: Card) {
  const level = content.levels.find((item) => item.id === card.level);

  return {
    id: card.id,
    code: card.code,
    text: card.text,
    level_id: card.level,
    level_order: level?.intensity_order ?? card.intensity,
    card_type: card.card_type,
    intensity: card.intensity,
    performer: card.performer,
    target: card.target,
    tags: tagSlugsForCard(content, card.id),
    gm_escalation_score: card.gm_escalation_score,
    gm_energy_score: card.gm_energy_score,
    gm_intimacy_score: card.gm_intimacy_score,
    gm_humor_score: card.gm_humor_score,
    gm_recovery_score: card.gm_recovery_score,
    gm_novelty_score: card.gm_novelty_score,
    gm_continuity_group: card.gm_continuity_group,
    gm_scene_role: card.gm_scene_role,
  };
}

export async function requestGameMasterDecision({
  content,
  setup,
  session,
  player,
  candidates,
  resolvedEvent,
}: {
  content: ContentBundle;
  setup: GameSetup;
  session: SessionState;
  player: 0 | 1;
  candidates: Card[];
  resolvedEvent: GameMasterEvent | null;
}): Promise<GameMasterDecision> {
  if (!env.gameMasterUrl) {
    throw new Error('El Game Master no está configurado.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 16_000);

  try {
    const response = await fetch(
      `${env.gameMasterUrl}/v1/game-master/next`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          game_id: content.game.id,
          session_id: session.id,
          mode_id: setup.modeId,
          current_player: player,
          resolved_count: session.resolvedCount,
          max_cards: setup.maxCards,
          current_phase: session.gmPhase,
          current_tension: session.gmTension,
          current_energy: session.gmEnergy,
          selected_level_ids: setup.levelIds,
          selected_deck_ids: setup.deckIds,
          player_sexes: [
            sexSlug(content, setup.playerOneSexId),
            sexSlug(content, setup.playerTwoSexId),
          ],
          recent_events: session.gmEvents
            .filter((event) => event.id !== resolvedEvent?.id)
            .slice(-10)
            .map(eventPayload),
          resolved_event: resolvedEvent ? eventPayload(resolvedEvent) : null,
          candidates: candidates
            .slice(0, 50)
            .map((card) => candidatePayload(content, card)),
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`El Game Master respondió ${response.status}.`);
    }

    return responseSchema.parse(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}

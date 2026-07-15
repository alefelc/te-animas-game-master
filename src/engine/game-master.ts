import { requestGameMasterDecision } from '../api/game-master';
import type {
  Card,
  ContentBundle,
  GameMasterEvent,
  GameSetup,
  SessionState,
} from '../types';
import {
  applyCardSelection,
  drawNextCard,
  getDrawCandidatePool,
  type DrawResult,
} from './session';

function rankCandidates(
  candidates: Card[],
  session: SessionState,
  resolvedEvent: GameMasterEvent | null,
) {
  const continuity = resolvedEvent?.continuityGroup;

  return [...candidates].sort((a, b) => {
    const score = (card: Card) => {
      let value = card.weight / 100;
      value += card.gm_novelty_score * 0.25;

      if (
        continuity &&
        card.gm_continuity_group === continuity
      ) {
        value += resolvedEvent?.reaction === 'repeat_style' ? 6 : 2;
      }

      if (resolvedEvent?.reaction === 'too_much') {
        value += card.gm_recovery_score * 1.6;
        value -= Math.max(0, card.gm_escalation_score) * 2;
      }

      if (resolvedEvent?.reaction === 'too_soft') {
        value += card.gm_escalation_score * 1.8;
      }

      value -= session.usedCardIds.includes(card.id) ? 100 : 0;
      return value;
    };

    return score(b) - score(a);
  });
}

export async function drawAdaptiveCard(
  content: ContentBundle,
  setup: GameSetup,
  session: SessionState,
  resolvedEvent: GameMasterEvent | null,
): Promise<DrawResult> {
  if (!setup.gameMasterEnabled) {
    return drawNextCard(content, setup, session);
  }

  const pool = getDrawCandidatePool(content, setup, session);
  if (pool.exhausted || !pool.candidates.length) {
    return { session, card: null, exhausted: true };
  }

  try {
    const candidates = rankCandidates(
      pool.candidates,
      session,
      resolvedEvent,
    ).slice(0, 50);

    const decision = await requestGameMasterDecision({
      content,
      setup,
      session,
      player: pool.player,
      candidates,
      resolvedEvent,
    });

    const selected = candidates.find(
      (card) => card.id === decision.selected_card_id,
    );

    if (!selected) {
      throw new Error('La carta elegida ya no está disponible.');
    }

    return {
      session: applyCardSelection(
        session,
        selected,
        pool.player,
        {
          phase: decision.phase,
          tension: decision.target_tension,
          energy: decision.target_energy,
          hostMessage: decision.host_message || null,
          strategy: decision.strategy,
          fallbackUsed: decision.fallback_used,
          provider: decision.provider,
          model: decision.model,
          latencyMs: decision.latency_ms,
        },
      ),
      card: selected,
      exhausted: false,
    };
  } catch (error) {
    console.warn('Se continuó con la selección local.', error);

    const local = drawNextCard(content, setup, session);

    return {
      ...local,
      session: {
        ...local.session,
        gmFallbackUsed: true,
        gmProvider: 'frontend_fallback',
        gmModel: 'local-browser',
        gmLatencyMs: null,
      },
    };
  }
}

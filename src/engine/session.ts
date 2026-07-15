import type { Card, ContentBundle, GameMode, GameSetup, Id, SessionState } from '../types';
import { eligibleCards } from './eligibility';
import { weightedPick } from './random';

export function createDefaultSetup(content: ContentBundle): GameSetup {
  const safeLevels = content.levels.filter((level) => !level.requires_confirmation).map((level) => level.id);
  const fallbackLevel = content.settings.default_level ?? content.levels[0]?.id ?? '';
  const defaultLevels = safeLevels.length ? safeLevels : [fallbackLevel];
  const defaultMode = content.settings.default_mode ?? content.modes[0]?.id ?? '';

  return {
    playerOne: '',
    playerTwo: '',
    playerOneSexId: null,
    playerTwoSexId: null,
    modeId: defaultMode,
    levelIds: defaultLevels,
    deckIds: content.decks.filter((deck) => deck.active).map((deck) => deck.id),
    elementIds: [],
    toyIds: [],
    filters: {
      excludePhotoVideo: content.settings.default_exclude_photo_video,
      excludeThirdParties: content.settings.default_exclude_third_parties,
      excludePublicPlaces: content.settings.default_exclude_public_places,
      excludeRestraint: content.settings.default_exclude_restraint,
      excludePenetration: false,
      excludeAnal: false,
      excludeOral: false,
      excludeNudity: false,
      excludeExplicitLanguage: false,
      excludeFood: false,
      excludeTemperature: false,
      excludeRoleplay: false,
      excludeManualStimulation: false,
      excludeToys: false,
      maxPrivacyRisk: 1,
      maxPhysicalRisk: 1,
    },
    maxCards: Math.min(20, Math.max(1, content.settings.maximum_cards_per_session || 20)),
    intenseConsent: false,
    gameMasterEnabled: content.settings.game_master_enabled && content.settings.game_master_default_on,
  };
}

export function createSession(content: ContentBundle, setup: GameSetup): SessionState {
  const mode = content.modes.find((item) => item.id === setup.modeId) ?? content.modes[0];
  const startingLevel = resolveStartingLevel(content, setup, mode);
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    currentCardId: null,
    currentLevelId: startingLevel,
    currentPlayer: 0,
    revealed: false,
    usedCardIds: [],
    completedCardIds: [],
    skippedCardIds: [],
    resolvedCount: 0,
    timerStartedAt: null,
    timerRemaining: null,
    gmPhase: 'warmup',
    gmTension: 15,
    gmEnergy: 25,
    gmHostMessage: null,
    gmStrategy: null,
    gmReaction: 'none',
    gmEvents: [],
    gmFallbackUsed: false,
    gmProvider: null,
    gmModel: null,
    gmLatencyMs: null,
  };
}

function resolveStartingLevel(content: ContentBundle, setup: GameSetup, mode?: GameMode): Id | null {
  const selected = new Set(setup.levelIds);
  if (mode?.slug === 'solo-previa') {
    return content.levels.find((level) => level.slug === 'previa')?.id ?? setup.levelIds[0] ?? null;
  }
  if (mode?.starting_level && selected.has(mode.starting_level)) return mode.starting_level;
  return content.levels
    .filter((level) => selected.has(level.id))
    .sort((a, b) => a.intensity_order - b.intensity_order)[0]?.id ?? null;
}

function targetLevelForDraw(
  content: ContentBundle,
  setup: GameSetup,
  session: SessionState,
  mode: GameMode,
): Id | null {
  const selectedLevels = content.levels
    .filter((level) => setup.levelIds.includes(level.id))
    .sort((a, b) => a.intensity_order - b.intensity_order);

  if (mode.slug === 'solo-previa') {
    return selectedLevels.find((level) => level.slug === 'previa')?.id ?? selectedLevels[0]?.id ?? null;
  }

  if (mode.automatic_progression && mode.cards_before_level_up > 0) {
    const index = Math.min(
      selectedLevels.length - 1,
      Math.floor(session.resolvedCount / mode.cards_before_level_up),
    );
    return selectedLevels[Math.max(0, index)]?.id ?? session.currentLevelId;
  }

  if (mode.slug === 'clasico') return session.currentLevelId ?? selectedLevels[0]?.id ?? null;
  return null;
}

function nextPlayer(current: 0 | 1, mode: GameMode, random: () => number): 0 | 1 {
  if (mode.turn_mode === 'random') return random() < 0.5 ? 0 : 1;
  return current === 0 ? 1 : 0;
}

export interface DrawResult {
  session: SessionState;
  card: Card | null;
  exhausted: boolean;
}

export interface DrawCandidatePool {
  player: 0 | 1;
  candidates: Card[];
  exhausted: boolean;
}

export function getDrawCandidatePool(
  content: ContentBundle,
  setup: GameSetup,
  session: SessionState,
): DrawCandidatePool {
  if (session.resolvedCount >= setup.maxCards) {
    return { player: session.currentPlayer, candidates: [], exhausted: true };
  }

  const mode = content.modes.find((item) => item.id === setup.modeId) ?? content.modes[0];
  if (!mode) {
    return { player: session.currentPlayer, candidates: [], exhausted: true };
  }

  const contextForPlayer = (player: 0 | 1) => ({
    selectedLevelIds: new Set(setup.levelIds),
    selectedDeckIds: new Set(setup.deckIds),
    selectedElementIds: new Set(setup.elementIds),
    selectedToyIds: new Set(setup.toyIds),
    filters: setup.filters,
    currentPlayerSexId:
      player === 0 ? setup.playerOneSexId : setup.playerTwoSexId,
    partnerSexId:
      player === 0 ? setup.playerTwoSexId : setup.playerOneSexId,
  });

  const targetLevel = targetLevelForDraw(content, setup, session, mode);
  const used = new Set(session.usedCardIds);
  let drawPlayer = session.currentPlayer;

  const eligibleFor = (player: 0 | 1) =>
    eligibleCards(content, contextForPlayer(player))
      .filter((card) => !used.has(card.id));

  let allEligible = eligibleFor(drawPlayer);
  let candidates = targetLevel
    ? allEligible.filter((card) => card.level === targetLevel)
    : allEligible;

  if (!candidates.length && mode.slug !== 'solo-previa') {
    candidates = allEligible;
  }

  if (!candidates.length) {
    const otherPlayer: 0 | 1 = drawPlayer === 0 ? 1 : 0;
    const otherEligible = eligibleFor(otherPlayer);
    const otherCandidates = targetLevel
      ? otherEligible.filter((card) => card.level === targetLevel)
      : otherEligible;

    if (otherCandidates.length || otherEligible.length) {
      drawPlayer = otherPlayer;
      allEligible = otherEligible;
      candidates = otherCandidates.length ? otherCandidates : otherEligible;
    }
  }

  return {
    player: drawPlayer,
    candidates,
    exhausted: candidates.length === 0,
  };
}

export function applyCardSelection(
  session: SessionState,
  card: Card,
  player: 0 | 1,
  gameMaster?: {
    phase?: string;
    tension?: number;
    energy?: number;
    hostMessage?: string | null;
    strategy?: string | null;
    fallbackUsed?: boolean;
    provider?: 'openai' | 'adaptive_fallback' | 'frontend_fallback' | null;
    model?: string | null;
    latencyMs?: number | null;
  },
): SessionState {
  return {
    ...session,
    currentPlayer: player,
    currentCardId: card.id,
    currentLevelId: card.level,
    revealed: false,
    usedCardIds: [...session.usedCardIds, card.id],
    timerStartedAt: null,
    timerRemaining: card.duration_seconds,
    gmPhase: gameMaster?.phase ?? session.gmPhase,
    gmTension: gameMaster?.tension ?? session.gmTension,
    gmEnergy: gameMaster?.energy ?? session.gmEnergy,
    gmHostMessage: gameMaster?.hostMessage ?? null,
    gmStrategy: gameMaster?.strategy ?? null,
    gmReaction: 'none',
    gmFallbackUsed: gameMaster?.fallbackUsed ?? false,
    gmProvider: gameMaster?.provider ?? null,
    gmModel: gameMaster?.model ?? null,
    gmLatencyMs: gameMaster?.latencyMs ?? null,
  };
}

export function drawNextCard(
  content: ContentBundle,
  setup: GameSetup,
  session: SessionState,
  random: () => number = Math.random,
): DrawResult {
  const pool = getDrawCandidatePool(content, setup, session);
  const card = weightedPick(pool.candidates, random);

  if (!card) {
    return {
      session: { ...session, currentCardId: null },
      card: null,
      exhausted: true,
    };
  }

  return {
    session: applyCardSelection(session, card, pool.player),
    card,
    exhausted: false,
  };
}

export function resolveCurrentCard(
  content: ContentBundle,
  setup: GameSetup,
  session: SessionState,
  result: 'completed' | 'skipped',
  random: () => number = Math.random,
): SessionState {
  if (!session.currentCardId) return session;
  const mode = content.modes.find((item) => item.id === setup.modeId) ?? content.modes[0];
  if (!mode) return session;

  return {
    ...session,
    currentCardId: null,
    currentPlayer: nextPlayer(session.currentPlayer, mode, random),
    completedCardIds: result === 'completed'
      ? [...session.completedCardIds, session.currentCardId]
      : session.completedCardIds,
    skippedCardIds: result === 'skipped'
      ? [...session.skippedCardIds, session.currentCardId]
      : session.skippedCardIds,
    resolvedCount: session.resolvedCount + 1,
    revealed: false,
    timerStartedAt: null,
    timerRemaining: null,
    gmReaction: 'none',
  };
}

export function previewEligibleCount(
  content: ContentBundle,
  setup: GameSetup,
): number {
  const common = {
    selectedLevelIds: new Set(setup.levelIds),
    selectedDeckIds: new Set(setup.deckIds),
    selectedElementIds: new Set(setup.elementIds),
    selectedToyIds: new Set(setup.toyIds),
    filters: setup.filters,
  };

  const one = eligibleCards(content, {
    ...common,
    currentPlayerSexId: setup.playerOneSexId,
    partnerSexId: setup.playerTwoSexId,
  });

  const two = eligibleCards(content, {
    ...common,
    currentPlayerSexId: setup.playerTwoSexId,
    partnerSexId: setup.playerOneSexId,
  });

  return new Set([...one, ...two].map((card) => card.id)).size;
}

import { create } from 'zustand';
import type {
  ContentBundle,
  ContentSource,
  GameMasterEvent,
  GameMasterReaction,
  GameSetup,
  Id,
  SessionState,
} from '../types';
import {
  createDefaultSetup,
  createSession,
  drawNextCard,
  resolveCurrentCard,
} from '../engine/session';
import { drawAdaptiveCard } from '../engine/game-master';

export type AppStage = 'age' | 'home' | 'setup' | 'game' | 'paused' | 'summary';

interface GameStore {
  stage: AppStage;
  content: ContentBundle | null;
  contentSource: ContentSource | null;
  contentWarning: string | null;
  setup: GameSetup | null;
  session: SessionState | null;
  gameMasterBusy: boolean;
  setContent: (content: ContentBundle, source: ContentSource, warning: string | null) => void;
  acceptAge: () => void;
  goHome: () => void;
  openSetup: () => void;
  updateSetup: (patch: Partial<GameSetup>) => void;
  updateFilters: (patch: Partial<GameSetup['filters']>) => void;
  startGame: () => Promise<void>;
  revealCard: () => void;
  reactToCard: (reaction: GameMasterReaction) => void;
  resolveCard: (result: 'completed' | 'skipped') => Promise<void>;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  setCurrentLevel: (levelId: Id) => void;
  restart: () => void;
}

function normalizeSetup(content: ContentBundle, setup: GameSetup | null): GameSetup {
  const defaults = createDefaultSetup(content);
  if (!setup) return defaults;

  return {
    ...defaults,
    ...setup,
    playerOne: setup.playerOne === 'Vos' ? '' : setup.playerOne,
    playerTwo: setup.playerTwo === 'Tu pareja' ? '' : setup.playerTwo,
    playerOneSexId: setup.playerOneSexId ?? null,
    playerTwoSexId: setup.playerTwoSexId ?? null,
    gameMasterEnabled:
      content.settings.game_master_enabled &&
      (setup.gameMasterEnabled ?? defaults.gameMasterEnabled),
    filters: {
      ...defaults.filters,
      ...setup.filters,
    },
  };
}

function eventFromCurrentCard(
  content: ContentBundle,
  session: SessionState,
  result: 'completed' | 'skipped',
): GameMasterEvent | null {
  const card = content.cards.find(
    (item) => item.id === session.currentCardId,
  );

  if (!card) return null;

  return {
    id: crypto.randomUUID(),
    cardId: card.id,
    result,
    reaction: session.gmReaction,
    playerIndex: session.currentPlayer,
    intensity: card.intensity,
    continuityGroup: card.gm_continuity_group,
    sceneRole: card.gm_scene_role,
    createdAt: new Date().toISOString(),
  };
}

const ageAccepted = () =>
  localStorage.getItem('pecadoclub-age-accepted') === 'true';

export const useGameStore = create<GameStore>((set, get) => ({
  stage: ageAccepted() ? 'home' : 'age',
  content: null,
  contentSource: null,
  contentWarning: null,
  setup: null,
  session: null,
  gameMasterBusy: false,

  setContent(content, source, warning) {
    set((state) => ({
      content,
      contentSource: source,
      contentWarning: warning,
      setup: normalizeSetup(content, state.setup),
    }));
  },

  acceptAge() {
    localStorage.setItem('pecadoclub-age-accepted', 'true');
    set({ stage: 'home' });
  },

  goHome() {
    set({ stage: 'home', session: null, gameMasterBusy: false });
  },

  openSetup() {
    const { content, setup } = get();
    if (!content) return;

    set({
      stage: 'setup',
      setup: normalizeSetup(content, setup),
      session: null,
      gameMasterBusy: false,
    });
  },

  updateSetup(patch) {
    const setup = get().setup;
    if (!setup) return;
    set({ setup: { ...setup, ...patch } });
  },

  updateFilters(patch) {
    const setup = get().setup;
    if (!setup) return;

    set({
      setup: {
        ...setup,
        filters: { ...setup.filters, ...patch },
      },
    });
  },

  async startGame() {
    const { content, setup, gameMasterBusy } = get();
    if (!content || !setup || gameMasterBusy) return;

    const initial = createSession(content, setup);

    if (!setup.gameMasterEnabled) {
      const draw = drawNextCard(content, setup, initial);

      set({
        stage: draw.exhausted ? 'summary' : 'game',
        session: draw.session,
        gameMasterBusy: false,
      });

      return;
    }

    set({
      stage: 'game',
      session: initial,
      gameMasterBusy: true,
    });

    try {
      const draw = await drawAdaptiveCard(
        content,
        setup,
        initial,
        null,
      );

      set({
        stage: draw.exhausted ? 'summary' : 'game',
        session: draw.session,
        gameMasterBusy: false,
      });
    } catch {
      const draw = drawNextCard(content, setup, initial);

      set({
        stage: draw.exhausted ? 'summary' : 'game',
        session: draw.session,
        gameMasterBusy: false,
      });
    }
  },

  revealCard() {
    const session = get().session;
    if (!session) return;
    set({ session: { ...session, revealed: true } });
  },

  reactToCard(reaction) {
    const session = get().session;
    if (!session || !session.revealed) return;

    set({
      session: {
        ...session,
        gmReaction:
          session.gmReaction === reaction ? 'none' : reaction,
      },
    });
  },

  async resolveCard(result) {
    const {
      content,
      setup,
      session,
      gameMasterBusy,
    } = get();

    if (!content || !setup || !session || gameMasterBusy) return;

    const resolvedEvent = eventFromCurrentCard(
      content,
      session,
      result,
    );

    let resolved = resolveCurrentCard(
      content,
      setup,
      session,
      result,
    );

    if (resolvedEvent) {
      resolved = {
        ...resolved,
        gmEvents: [...resolved.gmEvents, resolvedEvent].slice(-20),
      };
    }

    if (!setup.gameMasterEnabled) {
      const draw = drawNextCard(
        content,
        setup,
        resolved,
      );

      set({
        stage: draw.exhausted ? 'summary' : 'game',
        session: draw.session,
        gameMasterBusy: false,
      });

      return;
    }

    set({
      session: resolved,
      gameMasterBusy: true,
    });

    try {
      const draw = await drawAdaptiveCard(
        content,
        setup,
        resolved,
        resolvedEvent,
      );

      set({
        stage: draw.exhausted ? 'summary' : 'game',
        session: draw.session,
        gameMasterBusy: false,
      });
    } catch {
      const draw = drawNextCard(
        content,
        setup,
        resolved,
      );

      set({
        stage: draw.exhausted ? 'summary' : 'game',
        session: draw.session,
        gameMasterBusy: false,
      });
    }
  },

  pause() {
    if (get().stage === 'game') set({ stage: 'paused' });
  },

  resume() {
    if (get().stage === 'paused') set({ stage: 'game' });
  },

  finish() {
    const session = get().session;
    set({
      stage: 'summary',
      session: session
        ? { ...session, endedAt: new Date().toISOString() }
        : session,
      gameMasterBusy: false,
    });
  },

  setCurrentLevel(levelId) {
    const session = get().session;
    if (!session) return;
    set({ session: { ...session, currentLevelId: levelId } });
  },

  restart() {
    const { content } = get();
    set({
      stage: 'setup',
      session: null,
      setup: content ? createDefaultSetup(content) : null,
      gameMasterBusy: false,
    });
  },
}));

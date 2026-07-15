import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ContentBundle, GameMasterReaction, GameSetup, Id, SessionState } from '../types';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}


function readAnimationDuration(): number {
  const fallback = 320;

  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--pc-animation')
      .trim();

    if (value.endsWith('ms')) {
      return Number.parseFloat(value) || fallback;
    }

    if (value.endsWith('s')) {
      return (Number.parseFloat(value) || fallback / 1000) * 1000;
    }
  } catch {
    // Se usa la duración predeterminada.
  }

  return fallback;
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Algunos navegadores iOS no implementan Fullscreen API para páginas normales.
  }
}

export function GameScreen({
  content,
  setup,
  session,
  onReveal,
  onResolve,
  onReact,
  gameMasterBusy,
  onPause,
  onSetLevel,
}: {
  content: ContentBundle;
  setup: GameSetup;
  session: SessionState;
  onReveal: () => void;
  onResolve: (result: 'completed' | 'skipped') => void;
  onReact: (reaction: GameMasterReaction) => void;
  gameMasterBusy: boolean;
  onPause: () => void;
  onSetLevel: (levelId: Id) => void;
}) {
  const card =
    content.cards.find((item) => item.id === session.currentCardId) ?? null;

  const level =
    content.levels.find((item) => item.id === card?.level) ?? null;

  const mode =
    content.modes.find((item) => item.id === setup.modeId) ??
    content.modes[0];

  const player =
    session.currentPlayer === 0
      ? setup.playerOne || 'Vos'
      : setup.playerTwo || 'Tu pareja';

  const gameMasterStatus =
    session.gmProvider === 'openai'
      ? {
          label: 'IA activa',
          detail: session.gmModel || 'Game Master',
          tone: 'online',
        }
      : session.gmProvider === 'adaptive_fallback'
        ? {
            label: 'Adaptación local',
            detail: 'La conexión funciona, pero la IA no respondió',
            tone: 'fallback',
          }
        : session.gmProvider === 'frontend_fallback'
          ? {
              label: 'Sin conexión al Game Master',
              detail: 'La partida continúa con selección local',
              tone: 'offline',
            }
          : {
              label: 'Game Master activado',
              detail: 'Preparando la dirección de la partida',
              tone: 'pending',
            };

  const [timerRunning, setTimerRunning] = useState(false);
  const [remaining, setRemaining] = useState(card?.duration_seconds ?? 0);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [visualRevealed, setVisualRevealed] = useState(session.revealed);
  const [isFlipping, setIsFlipping] = useState(false);
  const flipTimers = useRef<number[]>([]);

  useEffect(() => {
    flipTimers.current.forEach((timer) => window.clearTimeout(timer));
    flipTimers.current = [];

    setRemaining(card?.duration_seconds ?? 0);
    setTimerRunning(false);
    setVisualRevealed(session.revealed);
    setIsFlipping(false);

    return () => {
      flipTimers.current.forEach((timer) => window.clearTimeout(timer));
      flipTimers.current = [];
    };
  }, [card?.id, card?.duration_seconds]);

  useEffect(() => {
    if (!timerRunning || remaining <= 0) return;

    const interval = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(interval);
          setTimerRunning(false);

          if (
            content.settings.allow_vibration &&
            typeof navigator.vibrate === 'function'
          ) {
            navigator.vibrate([100, 80, 180]);
          }

          return 0;
        }

        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [
    timerRunning,
    remaining,
    content.settings.allow_vibration,
  ]);

  const requirements = useMemo(() => {
    if (!card) return [];

    const elements = content.cardElements
      .filter((row) => row.card === card.id)
      .map(
        (row) =>
          content.elements.find((item) => item.id === row.element)?.name,
      )
      .filter(Boolean) as string[];

    const toys = content.cardToys
      .filter((row) => row.card === card.id)
      .map(
        (row) =>
          content.toys.find((item) => item.id === row.toy)?.name,
      )
      .filter(Boolean) as string[];

    return [...elements, ...toys];
  }, [
    card,
    content.cardElements,
    content.cardToys,
    content.elements,
    content.toys,
  ]);

  const reveal = () => {
    if (!card || session.revealed || isFlipping) return;

    const duration = readAnimationDuration();
    const midpoint = Math.max(80, Math.round(duration / 2));

    setIsFlipping(true);

    flipTimers.current.push(
      window.setTimeout(() => {
        setVisualRevealed(true);
        onReveal();
      }, midpoint),
    );

    flipTimers.current.push(
      window.setTimeout(() => {
        setIsFlipping(false);
        flipTimers.current = [];
      }, duration + 40),
    );

    if (
      content.theme.enable_vibration &&
      content.settings.allow_vibration &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(35);
    }
  };

  if (!card || !level || !mode) return null;

  const progress = Math.min(
    100,
    (session.resolvedCount / setup.maxCards) * 100,
  );

  const canChangeLevel =
    mode.slug === 'clasico' &&
    mode.allow_manual_level_change;

  const levelStyle = {
    '--level-color': level.color,
  } as CSSProperties;

  return (
    <div className="game-shell">
      <header className="game-header">
        <Brand
          game={content.game}
          theme={content.theme}
          compact
        />

        <div className="game-header-actions">
          {canChangeLevel && (
            <button
              className="icon-button"
              type="button"
              onClick={() =>
                setShowLevelPicker((value) => !value)
              }
              aria-label="Cambiar nivel"
            >
              <Icon name="settings" />
            </button>
          )}

          {content.settings.allow_fullscreen && (
            <button
              className="icon-button"
              type="button"
              onClick={toggleFullscreen}
              aria-label="Pantalla completa"
            >
              <Icon name="fullscreen" />
            </button>
          )}
        </div>
      </header>

      {showLevelPicker && canChangeLevel && (
        <div className="level-picker">
          <span>Próxima carta:</span>

          {content.levels
            .filter((item) => setup.levelIds.includes(item.id))
            .map((item) => (
              <button
                key={item.id}
                className={
                  session.currentLevelId === item.id ? 'active' : ''
                }
                type="button"
                onClick={() => {
                  onSetLevel(item.id);
                  setShowLevelPicker(false);
                }}
              >
                {item.name}
              </button>
            ))}
        </div>
      )}

      <main className="game-main">
        <div className="game-meta">
          <div>
            <span
              className="level-pill"
              style={levelStyle}
            >
              {level.name}
            </span>
          </div>

          <div className="counter">
            <b>{session.resolvedCount + 1}</b>
            <span>/ {setup.maxCards}</span>
          </div>
        </div>

        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>

        {setup.gameMasterEnabled && session.gmHostMessage && (
          <div className="game-master-message">
            <span>Game Master</span>
            <p>{session.gmHostMessage}</p>
          </div>
        )}

        {setup.gameMasterEnabled && (
          <div
            className={`game-master-status ${gameMasterStatus.tone}`}
            aria-live="polite"
          >
            <span />
            <div>
              <b>{gameMasterStatus.label}</b>
              <small>{gameMasterStatus.detail}</small>
            </div>
          </div>
        )}

        <button
          className="card-stage"
          type="button"
          onClick={reveal}
          aria-label={
            session.revealed
              ? 'Carta revelada'
              : 'Revelar carta'
          }
        >
          <article
            className={`playing-card ${
              isFlipping ? 'flipping' : ''
            } ${visualRevealed ? 'revealed' : ''}`}
            style={levelStyle}
          >
            {!visualRevealed ? (
              <div className="card-face card-back">
                <div className="card-logo">
                  <Brand
                    game={content.game}
                    theme={content.theme}
                  />
                  <small>Tocá para revelar</small>
                </div>
              </div>
            ) : (
              <div className="card-face card-front">
              <div
                className="card-player-name"
                style={{
                  alignSelf: 'stretch',
                  textAlign: 'left',
                  fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)',
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: 'var(--pc-accent)',
                  marginBottom: 'clamp(1rem, 3vw, 1.5rem)',
                  overflowWrap: 'anywhere',
                }}
              >
                {player}
              </div>

              <p className="card-text">{card.text}</p>

              {card.instructions && (
                <p className="card-instructions">
                  {card.instructions}
                </p>
              )}

              {requirements.length > 0 && (
                <div className="requirement-chips">
                  {requirements.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              )}

              {card.safety_note && (
                <div className="card-safety">
                  <Icon name="info" />
                  {card.safety_note}
                </div>
              )}

              <div className="card-ornament">
                <span />
                <img
                  src={`${import.meta.env.BASE_URL}te-animas-symbol.svg`}
                  alt=""
                  aria-hidden="true"
                  className="card-ornament-logo"
                  style={{
                    width: 'clamp(1.65rem, 5vw, 2.15rem)',
                    height: 'clamp(1.65rem, 5vw, 2.15rem)',
                    display: 'block',
                    objectFit: 'contain',
                    flexShrink: 0,
                  }}
                />
                <span />
              </div>
            </div>
            )}
          </article>
        </button>

        {session.revealed &&
          setup.gameMasterEnabled &&
          content.settings.game_master_show_reactions !== false && (
            <section className="game-master-feedback">
              <div className="game-master-feedback-heading">
                <b>¿Cómo estuvo?</b>
                <span>Esto guía la próxima carta</span>
              </div>

              <div
                className="game-master-reactions"
                aria-label="Reacción a la carta"
              >
                {([
                  ['liked', '🔥', 'Me gustó'],
                  ['too_soft', '⬆️', 'Más intenso'],
                  ['too_much', '⬇️', 'Bajar'],
                  ['repeat_style', '🔁', 'Similar'],
                ] as const).map(([reaction, icon, label]) => (
                  <button
                    key={reaction}
                    type="button"
                    className={
                      session.gmReaction === reaction ? 'selected' : ''
                    }
                    onClick={() => onReact(reaction)}
                    disabled={gameMasterBusy}
                    aria-pressed={session.gmReaction === reaction}
                  >
                    <span>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}

        {session.revealed &&
        card.duration_seconds &&
        content.settings.show_timer ? (
          <div
            className={`timer-panel ${
              remaining === 0 ? 'finished' : ''
            }`}
          >
            <div>
              <b>{formatTime(remaining)}</b>
              <span>
                {remaining === 0
                  ? 'Tiempo cumplido'
                  : 'Temporizador sugerido'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (remaining === 0) {
                  setRemaining(card.duration_seconds ?? 0);
                }

                setTimerRunning((value) => !value);
              }}
            >
              {remaining === 0
                ? 'Reiniciar'
                : timerRunning
                  ? 'Pausar'
                  : 'Iniciar'}
            </button>
          </div>
        ) : null}

        {session.revealed ? (
          <>
            {gameMasterBusy && (
              <div className="game-master-thinking">
                <span />
                El Game Master prepara la próxima carta…
              </div>
            )}

            <div className="game-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => onResolve('skipped')}
                disabled={gameMasterBusy}
              >
                Saltar
              </button>

              <button
                className="primary-button"
                type="button"
                onClick={() => onResolve('completed')}
                disabled={gameMasterBusy}
              >
                Cumplido
                <Icon name="check" />
              </button>
            </div>
          </>
        ) : (
          <p className="reveal-hint">
            La carta está oculta. Tocala cuando ambos estén listos.
          </p>
        )}

        <button
          className="stop-button"
          type="button"
          onClick={onPause}
        >
          <b>{content.settings.stop_word}</b>
          <span>Pausar sin explicar</span>
        </button>
      </main>
    </div>
  );
}

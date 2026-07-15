import { useMemo, useState } from 'react';
import type { ContentBundle, GameSetup, Id, SafetyFilters } from '../types';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { previewEligibleCount } from '../engine/session';
import { env } from '../env';

function toggleId(values: Id[], id: Id): Id[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function ChoiceToggle({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description?: string | null;
  onChange: () => void;
}) {
  return (
    <button className={`choice-toggle ${checked ? 'selected' : ''}`} type="button" onClick={onChange} aria-pressed={checked}>
      <span className="choice-check">{checked && <Icon name="check" />}</span>
      <span><b>{title}</b>{description && <small>{description}</small>}</span>
    </button>
  );
}

function FilterToggle({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="filter-row">
      <span><b>{title}</b>{description && <small>{description}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function SetupScreen({
  content,
  setup,
  onBack,
  onStart,
  updateSetup,
  updateFilters,
}: {
  content: ContentBundle;
  setup: GameSetup;
  onBack: () => void;
  onStart: () => void;
  updateSetup: (patch: Partial<GameSetup>) => void;
  updateFilters: (patch: Partial<SafetyFilters>) => void;
}) {
  const [step, setStep] = useState(0);
  const stepContent = [
    {
      label: content.settings.setup_step_1_label,
      title: content.settings.setup_step_1_title,
      subtitle: content.settings.setup_step_1_subtitle,
    },
    {
      label: content.settings.setup_step_2_label,
      title: content.settings.setup_step_2_title,
      subtitle: content.settings.setup_step_2_subtitle,
    },
    {
      label: content.settings.setup_step_3_label,
      title: content.settings.setup_step_3_title,
      subtitle: content.settings.setup_step_3_subtitle,
    },
    {
      label: content.settings.setup_step_4_label,
      title: content.settings.setup_step_4_title,
      subtitle: content.settings.setup_step_4_subtitle,
    },
  ];

  const steps = stepContent.map((item) => item.label);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const eligibleCount = useMemo(() => previewEligibleCount(content, setup), [content, setup]);
  const requiresIntenseConsent = content.levels.some((level) => setup.levelIds.includes(level.id) && level.requires_confirmation);
  const gameMasterAvailable = Boolean(env.gameMasterUrl);
  const peopleConfigured = Boolean(
    setup.playerOneSexId && setup.playerTwoSexId
  );
  const canStart = Boolean(
    peopleConfigured &&
    setup.modeId &&
    setup.levelIds.length &&
    eligibleCount > 0 &&
    (!requiresIntenseConsent || setup.intenseConsent)
  );

  const selectMode = (modeId: Id) => {
    const mode = content.modes.find((item) => item.id === modeId);
    if (mode?.slug === 'solo-previa') {
      const previa = content.levels.find((level) => level.slug === 'previa');
      updateSetup({ modeId, levelIds: previa ? [previa.id] : setup.levelIds });
      return;
    }
    updateSetup({ modeId });
  };

  return (
    <div className="app-page setup-page">
      <TopBar content={content} onBack={step === 0 ? onBack : () => setStep((value) => value - 1)} />
      <main className="setup-main">
        <div className="setup-progress">
          {steps.map((label, index) => (
            <div key={label} className={index <= step ? 'active' : ''}>
              <span>{index + 1}</span><small>{label}</small>
            </div>
          ))}
        </div>

        {step === 0 && (
          <section className="setup-section">
            <p className="eyebrow">PASO 1 DE 4</p>
            <h1>{stepContent[0].title}</h1>
            <p className="section-copy">{stepContent[0].subtitle}</p>

            <div className="player-grid">
              <div className="player-field">
                <label htmlFor="player-one-name">Persona 1</label>
                <input
                  id="player-one-name"
                  maxLength={24}
                  value={setup.playerOne}
                  onFocus={() => {
                    if (setup.playerOne === 'Vos') {
                      updateSetup({ playerOne: '' });
                    }
                  }}
                  onChange={(event) =>
                    updateSetup({ playerOne: event.target.value })
                  }
                  placeholder="Vos"
                  autoComplete="off"
                />
                <div className="sex-selector" role="group" aria-label="Sexo de la persona 1">
                  {content.sexes.map((sex) => (
                    <button
                      key={sex.id}
                      type="button"
                      className={setup.playerOneSexId === sex.id ? 'selected' : ''}
                      onClick={() => updateSetup({ playerOneSexId: sex.id })}
                      aria-pressed={setup.playerOneSexId === sex.id}
                    >
                      {sex.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="player-field">
                <label htmlFor="player-two-name">Persona 2</label>
                <input
                  id="player-two-name"
                  maxLength={24}
                  value={setup.playerTwo}
                  onFocus={() => {
                    if (setup.playerTwo === 'Tu pareja') {
                      updateSetup({ playerTwo: '' });
                    }
                  }}
                  onChange={(event) =>
                    updateSetup({ playerTwo: event.target.value })
                  }
                  placeholder="Tu pareja"
                  autoComplete="off"
                />
                <div className="sex-selector" role="group" aria-label="Sexo de la persona 2">
                  {content.sexes.map((sex) => (
                    <button
                      key={sex.id}
                      type="button"
                      className={setup.playerTwoSexId === sex.id ? 'selected' : ''}
                      onClick={() => updateSetup({ playerTwoSexId: sex.id })}
                      aria-pressed={setup.playerTwoSexId === sex.id}
                    >
                      {sex.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!peopleConfigured && (
              <p className="setup-warning">
                Elegí el sexo de las dos personas para continuar.
              </p>
            )}

            <h2 className="subheading">Modo de juego</h2>
            <div className="mode-grid">
              {content.modes.map((mode) => (
                <button key={mode.id} className={`mode-card ${setup.modeId === mode.id ? 'selected' : ''}`} type="button" onClick={() => selectMode(mode.id)}>
                  <span className="radio-dot" /><div><b>{mode.name}</b><p>{mode.description}</p></div>
                </button>
              ))}
            </div>


            {content.settings.game_master_enabled && (
              <div className="game-master-setup">
                <div className="game-master-availability">
                  <span
                    className={
                      gameMasterAvailable
                        ? setup.gameMasterEnabled
                          ? 'online'
                          : 'disabled'
                        : 'offline'
                    }
                  />
                  <b>
                    {gameMasterAvailable
                      ? setup.gameMasterEnabled
                        ? 'Conectado y activado'
                        : 'Conectado, pero desactivado'
                      : 'No conectado'}
                  </b>
                </div>

                <ChoiceToggle
                  checked={setup.gameMasterEnabled && gameMasterAvailable}
                  title={content.settings.game_master_title}
                  description={
                    gameMasterAvailable
                      ? content.settings.game_master_description
                      : 'No se pudo conectar el Game Master.'
                  }
                  onChange={() => {
                    if (gameMasterAvailable) {
                      updateSetup({
                        gameMasterEnabled: !setup.gameMasterEnabled,
                      });
                    }
                  }}
                />
              </div>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="setup-section">
            <p className="eyebrow">PASO 2 DE 4</p>
            <h1>{stepContent[1].title}</h1>
            <p className="section-copy">{stepContent[1].subtitle}</p>

            <div className="level-grid">
              {content.levels.map((level) => {
                const selected = setup.levelIds.includes(level.id);
                return (
                  <button
                    key={level.id}
                    className={`level-card ${selected ? 'selected' : ''}`}
                    type="button"
                    onClick={() => updateSetup({
                      levelIds: toggleId(setup.levelIds, level.id),
                      intenseConsent: level.requires_confirmation && selected ? false : setup.intenseConsent,
                    })}
                    style={{ '--level-color': level.color } as React.CSSProperties}
                  >
                    <span className="level-number">0{level.intensity_order}</span>
                    <div><b>{level.name}</b><p>{level.description}</p></div>
                    <span className="choice-check">{selected && <Icon name="check" />}</span>
                  </button>
                );
              })}
            </div>

            {requiresIntenseConsent && (
              <label className="intense-consent">
                <input type="checkbox" checked={setup.intenseConsent} onChange={(event) => updateSetup({ intenseConsent: event.target.checked })} />
                <span><b>Ambos aceptamos incluir niveles explícitos</b><small>Esto no reemplaza el consentimiento para cada carta y puede revocarse en cualquier momento.</small></span>
              </label>
            )}

            <details className="deck-details">
              <summary>Mazos incluidos <span>{setup.deckIds.length || 'todos'}</span></summary>
              <p>Los mazos agrupan cartas por temática. Si no elegís ninguno, se consideran todos.</p>
              <div className="choice-list compact">
                {content.decks.map((deck) => (
                  <ChoiceToggle
                    key={deck.id}
                    checked={setup.deckIds.includes(deck.id)}
                    title={deck.name}
                    description={deck.description}
                    onChange={() => updateSetup({ deckIds: toggleId(setup.deckIds, deck.id) })}
                  />
                ))}
              </div>
            </details>
          </section>
        )}

        {step === 2 && (
          <section className="setup-section">
            <p className="eyebrow">PASO 3 DE 4</p>
            <h1>{stepContent[2].title}</h1>
            <p className="section-copy">{stepContent[2].subtitle}</p>

            <h2 className="subheading">Elementos comunes</h2>
            <div className="choice-list two-columns">
              {content.elements.map((item) => (
                <ChoiceToggle
                  key={item.id}
                  checked={setup.elementIds.includes(item.id)}
                  title={item.name}
                  description={item.description}
                  onChange={() => updateSetup({ elementIds: toggleId(setup.elementIds, item.id) })}
                />
              ))}
            </div>

            <h2 className="subheading">Juguetes sexuales</h2>
            <div className="choice-list two-columns">
              {content.toys.map((toy) => (
                <ChoiceToggle
                  key={toy.id}
                  checked={setup.toyIds.includes(toy.id)}
                  title={toy.name}
                  description={`${toy.difficulty} · ${toy.description || ''}`}
                  onChange={() => updateSetup({ toyIds: toggleId(setup.toyIds, toy.id) })}
                />
              ))}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="setup-section">
            <p className="eyebrow">PASO 4 DE 4</p>
            <h1>{stepContent[3].title}</h1>
            <p className="section-copy">{stepContent[3].subtitle}</p>

            <div className="filter-list">
              <FilterToggle checked={setup.filters.excludePhotoVideo} title="Excluir fotos y videos" description="Evita creación o envío de contenido íntimo." onChange={(value) => updateFilters({ excludePhotoVideo: value })} />
              <FilterToggle checked={setup.filters.excludeThirdParties} title="Excluir terceras personas" onChange={(value) => updateFilters({ excludeThirdParties: value })} />
              <FilterToggle checked={setup.filters.excludePublicPlaces} title="Excluir lugares públicos" onChange={(value) => updateFilters({ excludePublicPlaces: value })} />
              <FilterToggle checked={setup.filters.excludeRestraint} title="Excluir vendas y sujeciones" onChange={(value) => updateFilters({ excludeRestraint: value })} />
              <FilterToggle checked={setup.filters.excludePenetration} title="Excluir penetración" onChange={(value) => updateFilters({ excludePenetration: value })} />
              <FilterToggle checked={setup.filters.excludeAnal} title="Excluir sexo anal" description="Excluye estimulación externa y penetración anal." onChange={(value) => updateFilters({ excludeAnal: value })} />
              <FilterToggle checked={setup.filters.excludeOral} title="Excluir sexo oral" onChange={(value) => updateFilters({ excludeOral: value })} />
              <FilterToggle checked={setup.filters.excludeNudity} title="Excluir desnudez" onChange={(value) => updateFilters({ excludeNudity: value })} />
              <FilterToggle checked={setup.filters.excludeToys} title="Excluir juguetes" onChange={(value) => updateFilters({ excludeToys: value })} />
            </div>

            <button className="advanced-toggle" type="button" onClick={() => setShowAdvanced((value) => !value)}>
              {showAdvanced ? 'Ocultar filtros avanzados' : 'Ver filtros avanzados'}
            </button>
            {showAdvanced && (
              <div className="filter-list advanced">
                <FilterToggle checked={setup.filters.excludeExplicitLanguage} title="Excluir lenguaje explícito" onChange={(value) => updateFilters({ excludeExplicitLanguage: value })} />
                <FilterToggle checked={setup.filters.excludeFood} title="Excluir alimentos" onChange={(value) => updateFilters({ excludeFood: value })} />
                <FilterToggle checked={setup.filters.excludeTemperature} title="Excluir hielo o temperatura" onChange={(value) => updateFilters({ excludeTemperature: value })} />
                <FilterToggle checked={setup.filters.excludeRoleplay} title="Excluir juego de roles" onChange={(value) => updateFilters({ excludeRoleplay: value })} />
                <FilterToggle checked={setup.filters.excludeManualStimulation} title="Excluir masturbación" onChange={(value) => updateFilters({ excludeManualStimulation: value })} />

                <label className="range-row"><span><b>Riesgo de privacidad máximo</b><small>{setup.filters.maxPrivacyRisk} de 3</small></span><input type="range" min="0" max="3" value={setup.filters.maxPrivacyRisk} onChange={(event) => updateFilters({ maxPrivacyRisk: Number(event.target.value) })} /></label>
                <label className="range-row"><span><b>Riesgo físico máximo</b><small>{setup.filters.maxPhysicalRisk} de 3</small></span><input type="range" min="0" max="3" value={setup.filters.maxPhysicalRisk} onChange={(event) => updateFilters({ maxPhysicalRisk: Number(event.target.value) })} /></label>
              </div>
            )}

            <label className="range-row cards-range">
              <span><b>Cantidad máxima de cartas</b><small>{setup.maxCards}</small></span>
              <input type="range" min="5" max={Math.max(5, content.settings.maximum_cards_per_session)} step="5" value={setup.maxCards} onChange={(event) => updateSetup({ maxCards: Number(event.target.value) })} />
            </label>

            <div className={`eligibility-summary ${eligibleCount === 0 ? 'invalid' : ''}`}>
              <div><b>{eligibleCount}</b><span>cartas compatibles con esta configuración</span></div>
              {eligibleCount === 0 && <p>Los filtros y elementos seleccionados dejaron la partida sin cartas. Volvé atrás y aflojá alguna restricción.</p>}
            </div>
          </section>
        )}

        <footer className="setup-footer">
          {step < steps.length - 1 ? (
            <button className="primary-button wide" type="button" disabled={(step === 0 && !peopleConfigured) || (step === 1 && setup.levelIds.length === 0)} onClick={() => setStep((value) => value + 1)}>
              Continuar <Icon name="arrow" />
            </button>
          ) : (
            <button className="primary-button wide" type="button" disabled={!canStart} onClick={onStart}>
              Iniciar partida <Icon name="flame" />
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

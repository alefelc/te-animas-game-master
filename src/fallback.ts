import type {
  Candidate,
  ModelDecision,
  NextRequest,
  SessionEvent,
} from './schemas.js';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lastEvent(request: NextRequest): SessionEvent | null {
  return request.resolved_event ?? request.recent_events.at(-1) ?? null;
}

function targetIntensity(request: NextRequest) {
  const progress = request.max_cards > 0
    ? request.resolved_count / request.max_cards
    : 0;

  let target = 1.5 + progress * 4.8;
  const event = lastEvent(request);

  if (event?.reaction === 'too_soft') target += 1;
  if (event?.reaction === 'too_much') target -= 1.5;
  if (event?.result === 'skipped') target -= 0.6;

  return clamp(target, 1, 6);
}

function phaseFor(request: NextRequest, event: SessionEvent | null) {
  const progress = request.max_cards > 0
    ? request.resolved_count / request.max_cards
    : 0;

  if (event?.reaction === 'too_much') return 'recovery' as const;
  if (progress >= 0.88) return 'closing' as const;
  if (progress >= 0.7) return 'peak' as const;
  if (progress >= 0.42) return 'intense' as const;
  if (progress >= 0.18) return 'build' as const;
  return 'warmup' as const;
}

function strategyFor(
  phase: ModelDecision['phase'],
  event: SessionEvent | null,
): ModelDecision['strategy'] {
  if (phase === 'closing') return 'close_session';
  if (phase === 'recovery') return 'slow_down';
  if (event?.reaction === 'repeat_style') return 'continue_scene';
  if (event?.reaction === 'change_style') return 'change_style';
  if (event?.reaction === 'too_soft') return 'escalate';
  if (phase === 'peak') return 'prepare_climax';
  return 'continue_scene';
}

function scoreCandidate(
  candidate: Candidate,
  request: NextRequest,
  target: number,
  phase: ModelDecision['phase'],
  event: SessionEvent | null,
) {
  let score = 20 - Math.abs(candidate.intensity - target) * 4;

  if (
    event?.continuity_group &&
    candidate.gm_continuity_group === event.continuity_group
  ) {
    if (event.reaction === 'repeat_style') score += 9;
    else if (event.reaction === 'change_style') score -= 14;
    else score += 4;
  }

  if (
    event?.reaction === 'change_style' &&
    candidate.gm_continuity_group !== event.continuity_group
  ) {
    score += 4 + candidate.gm_novelty_score;
  }

  if (event?.reaction === 'too_much') {
    score += candidate.gm_recovery_score * 2.2;
    score -= Math.max(0, candidate.gm_escalation_score) * 3;
  }

  if (event?.reaction === 'too_soft') {
    score += candidate.gm_escalation_score * 3;
  }

  if (event?.result === 'skipped') {
    if (
      event.continuity_group &&
      candidate.gm_continuity_group === event.continuity_group
    ) {
      score -= 5;
    }
  }

  if (phase === 'closing') {
    score += candidate.gm_scene_role === 'closer' ? 12 : 0;
    score += candidate.gm_recovery_score * 1.5;
  }

  if (phase === 'peak') {
    score += candidate.gm_scene_role === 'climax' ? 10 : 0;
  }

  if (phase === 'warmup') {
    score += candidate.gm_scene_role === 'starter' ? 8 : 0;
    score -= candidate.gm_escalation_score > 1 ? 5 : 0;
  }

  score += candidate.gm_novelty_score * 0.5;
  score += Math.random() * 1.5;

  return score;
}

export function chooseFallback(request: NextRequest): ModelDecision {
  const event = lastEvent(request);
  const target = targetIntensity(request);
  const phase = phaseFor(request, event);
  const strategy = strategyFor(phase, event);

  const selected = [...request.candidates]
    .sort(
      (a, b) =>
        scoreCandidate(b, request, target, phase, event) -
        scoreCandidate(a, request, target, phase, event),
    )[0];

  if (!selected) {
    throw new Error('No hay cartas candidatas.');
  }

  const messages: Record<ModelDecision['phase'], string> = {
    warmup: 'Arranquen sin apuro. Dejen que la tensión aparezca sola.',
    build: 'La partida empieza a tomar temperatura.',
    intimate: 'Ahora importa más la conexión que la velocidad.',
    intense: 'Sigan el ritmo: todavía no es momento de cortar la escena.',
    recovery: 'Bajen un cambio y vuelvan a encontrarse.',
    peak: 'Llegó el momento de ir un poco más lejos.',
    closing: 'Cierren la partida con una última escena que tenga sentido.',
  };

  return {
    selected_card_id: selected.id,
    phase,
    strategy,
    target_tension: clamp(Math.round(target * 16), 0, 100),
    target_energy: clamp(selected.gm_energy_score * 20, 0, 100),
    host_message: messages[phase],
    confidence: 0.62,
  };
}

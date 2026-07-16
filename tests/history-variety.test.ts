import { describe, expect, it } from 'vitest';
import { NextRequestSchema } from '../src/schemas.js';

const base = {
  game_id: 'game',
  session_id: 'ec07aa47-bce0-4415-a75d-6177489a8ced',
  mode_id: 'mode',
  current_player: 0,
  resolved_count: 4,
  max_cards: 12,
  current_phase: 'build',
  current_tension: 30,
  current_energy: 40,
  selected_level_ids: ['level'],
  selected_deck_ids: [],
  player_sexes: ['hombre', 'mujer'] as const,
  current_player_sex: 'hombre',
  partner_sex: 'mujer',
  recently_seen_card_ids: [],
  recently_seen_groups: ['besos', 'besos'],
  recently_seen_anatomy: ['boca', 'boca'],
  selected_toy_slugs: [],
  recent_events: [],
  resolved_event: null,
  candidates: [{
    id: 'card',
    code: 'EXTREMA',
    text: 'Carta extrema',
    level_id: 'level',
    level_order: 6,
    card_type: 'action',
    intensity: 6,
    performer: 'current_player',
    target: 'partner',
    performer_sex: null,
    target_sex: null,
    anatomy_focus: 'boca',
    anatomy_owner: 'target',
    penetration_method: 'none' as const,
    reciprocal_action: false,
    tags: [],
    gm_escalation_score: 3,
    gm_energy_score: 5,
    gm_intimacy_score: 4,
    gm_humor_score: 0,
    gm_recovery_score: 0,
    gm_novelty_score: 5,
    gm_continuity_group: 'besos',
    gm_scene_role: 'climax' as const,
  }],
};

describe('historial y extremos v1.3.0', () => {
  it('acepta cartas de escalada 3 y memoria de prácticas', () => {
    const parsed = NextRequestSchema.parse(base);
    expect(parsed.candidates[0].gm_escalation_score).toBe(3);
    expect(parsed.recently_seen_groups).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { chooseFallback } from '../src/fallback.js';
import { NextRequestSchema } from '../src/schemas.js';

const request = {
  game_id: 'game',
  session_id: 'ec07aa47-bce0-4415-a75d-6177489a8ced',
  mode_id: 'solo-mode',
  mode_slug: 'solitario',
  player_count: 1 as const,
  current_player: 0,
  resolved_count: 1,
  max_cards: 20,
  current_phase: 'warmup',
  current_tension: 15,
  current_energy: 25,
  selected_level_ids: ['level'],
  selected_deck_ids: ['solo-deck'],
  player_sexes: ['mujer', null] as [string, null],
  current_player_sex: 'mujer',
  partner_sex: null,
  recently_seen_card_ids: [],
  recently_seen_groups: [],
  recently_seen_anatomy: [],
  selected_toy_slugs: ['succionador'],
  selected_element_slugs: ['espejo'],
  recent_events: [],
  resolved_event: null,
  candidates: [{
    id: 'solo-card',
    code: 'SOLO',
    text: 'Tocate el clítoris.',
    level_id: 'level',
    level_order: 3,
    card_type: 'action',
    intensity: 3,
    play_scope: 'solo' as const,
    performer: 'current_player',
    target: 'self',
    performer_sex: 'mujer',
    target_sex: 'mujer',
    anatomy_focus: 'clitoris',
    anatomy_owner: 'performer',
    penetration_method: 'none' as const,
    reciprocal_action: false,
    tags: ['solitario', 'clitoris'],
    gm_escalation_score: 1,
    gm_energy_score: 3,
    gm_intimacy_score: 3,
    gm_humor_score: 0,
    gm_recovery_score: 0,
    gm_novelty_score: 4,
    gm_continuity_group: 'solo-clitoris',
    gm_scene_role: 'continuation' as const,
  }],
};

describe('modo Solitario v1.4.0', () => {
  it('acepta una solicitud para una persona con elementos y juguetes', () => {
    const parsed = NextRequestSchema.parse(request);
    expect(parsed.player_count).toBe(1);
    expect(parsed.partner_sex).toBeNull();
    expect(parsed.selected_element_slugs).toEqual(['espejo']);
    expect(parsed.candidates[0].play_scope).toBe('solo');
  });

  it('devuelve un mensaje singular en la selección local', () => {
    const result = chooseFallback(NextRequestSchema.parse(request));
    expect(result.selected_card_id).toBe('solo-card');
    expect(result.host_message).not.toMatch(/Arranquen|Sigan|Bajen|Cierren/);
  });
});

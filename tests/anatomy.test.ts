import { describe, expect, it } from 'vitest';
import { NextRequestSchema } from '../src/schemas.js';

describe('compatibilidad anatómica', () => {
  it('acepta anatomía y juguetes seleccionados', () => {
    const parsed = NextRequestSchema.parse({
      game_id: 'game',
      session_id:
        'ec07aa47-bce0-4415-a75d-6177489a8ced',
      mode_id: 'mode',
      current_player: 0,
      resolved_count: 1,
      max_cards: 10,
      current_phase: 'build',
      current_tension: 30,
      current_energy: 40,
      selected_level_ids: ['level'],
      selected_deck_ids: [],
      player_sexes: ['mujer', 'mujer'],
      current_player_sex: 'mujer',
      partner_sex: 'mujer',
      selected_toy_slugs: [],
      recent_events: [],
      resolved_event: null,
      candidates: [{
        id: 'card',
        code: 'TEST',
        text: 'Carta',
        level_id: 'level',
        level_order: 4,
        card_type: 'action',
        intensity: 4,
        performer: 'current_player',
        target: 'partner',
        performer_sex: 'mujer',
        target_sex: 'mujer',
        anatomy_focus: 'concha',
        anatomy_owner: 'target',
        penetration_method: 'dedos',
        reciprocal_action: false,
        tags: ['concha'],
        gm_escalation_score: 1,
        gm_energy_score: 4,
        gm_intimacy_score: 4,
        gm_humor_score: 0,
        gm_recovery_score: 0,
        gm_novelty_score: 3,
        gm_continuity_group: 'concha',
        gm_scene_role: 'continuation',
      }],
    });

    expect(parsed.current_player_sex).toBe('mujer');
    expect(
      parsed.candidates[0].penetration_method,
    ).toBe('dedos');
  });
});

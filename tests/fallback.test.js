import { describe, expect, it } from 'vitest';
import { chooseFallback } from '../src/fallback.js';
function request(reaction) {
    return {
        game_id: 'game',
        session_id: '11111111-1111-4111-8111-111111111111',
        mode_id: 'mode',
        current_player: 0,
        resolved_count: 4,
        max_cards: 20,
        current_phase: 'build',
        current_tension: 30,
        current_energy: 35,
        selected_level_ids: ['l1'],
        selected_deck_ids: [],
        player_sexes: ['hombre', 'mujer'],
        resolved_event: null,
        recent_events: [{
                id: '22222222-2222-4222-8222-222222222222',
                card_id: 'old',
                result: 'completed',
                reaction,
                player_index: 1,
                intensity: 3,
                continuity_group: 'besos',
                scene_role: 'continuation',
                created_at: new Date().toISOString(),
            }],
        candidates: [
            {
                id: 'soft', code: 'A', text: 'Suave', level_id: 'l1', level_order: 1,
                card_type: 'action', intensity: 2, performer: 'current_player', target: 'partner',
                tags: ['besos'], gm_escalation_score: -1, gm_energy_score: 2,
                gm_intimacy_score: 3, gm_humor_score: 0, gm_recovery_score: 5,
                gm_novelty_score: 2, gm_continuity_group: 'besos', gm_scene_role: 'recovery',
            },
            {
                id: 'hot', code: 'B', text: 'Intensa', level_id: 'l1', level_order: 4,
                card_type: 'action', intensity: 5, performer: 'current_player', target: 'partner',
                tags: ['oral'], gm_escalation_score: 2, gm_energy_score: 5,
                gm_intimacy_score: 3, gm_humor_score: 0, gm_recovery_score: 0,
                gm_novelty_score: 4, gm_continuity_group: 'oral', gm_scene_role: 'continuation',
            },
        ],
    };
}
describe('selección adaptativa local', () => {
    it('baja el ritmo cuando fue demasiado', () => {
        const decision = chooseFallback(request('too_much'));
        expect(decision.selected_card_id).toBe('soft');
        expect(decision.phase).toBe('recovery');
    });
    it('elige una carta válida', () => {
        const input = request('liked');
        const decision = chooseFallback(input);
        expect(input.candidates.some((card) => card.id === decision.selected_card_id)).toBe(true);
    });
});
//# sourceMappingURL=fallback.test.js.map
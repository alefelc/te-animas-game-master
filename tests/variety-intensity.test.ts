import { describe, expect, it } from 'vitest';
import { chooseFallback } from '../src/fallback.js';
import type { NextRequest } from '../src/schemas.js';

it('más intenso elige una carta claramente superior y evita vistas', () => {
  const base = {
    game_id:'game',session_id:'ec07aa47-bce0-4415-a75d-6177489a8ced',mode_id:'mode',current_player:0,resolved_count:4,max_cards:12,current_phase:'build',current_tension:30,current_energy:40,selected_level_ids:['a','b'],selected_deck_ids:[],player_sexes:['hombre','mujer'],current_player_sex:'hombre',partner_sex:'mujer',recently_seen_card_ids:['seen'],selected_toy_slugs:[],recent_events:[],resolved_event:{id:'3d61037f-22c5-4a75-a0d6-72fbca7d9156',card_id:'old',result:'completed',reaction:'too_soft',player_index:0,intensity:3,continuity_group:'besos',scene_role:'continuation',created_at:'2026-07-16T00:00:00.000Z'},
  };
  const card=(id:string,intensity:number)=>({id,code:id,text:id,level_id:'a',level_order:intensity,card_type:'action',intensity,performer:'current_player',target:'partner',performer_sex:null,target_sex:null,anatomy_focus:'body',anatomy_owner:'target',penetration_method:'none' as const,reciprocal_action:false,tags:[],gm_escalation_score:2,gm_energy_score:4,gm_intimacy_score:3,gm_humor_score:0,gm_recovery_score:0,gm_novelty_score:4,gm_continuity_group:id,gm_scene_role:'continuation' as const});
  const result=chooseFallback({...base,candidates:[card('seen',6),card('fresh',6),card('soft',3)]} as NextRequest);
  expect(result.selected_card_id).toBe('fresh');
});

import type { Candidate, NextRequest, SessionEvent } from "./schemas.js";

export const DIRECTOR_PROMPT = `
Sos la dirección adaptativa de “¿Te animás?”, un juego erótico para una o dos personas adultas.
Tu trabajo no es inventar contenido: elegís exactamente una carta de la lista recibida.

REGLAS INQUEBRANTABLES
- Elegí únicamente un selected_card_id presente en candidates.
- Los límites y compatibilidades ya fueron aplicados antes de recibir la lista. No intentes eludirlos ni compensarlos con texto.
- No alteres el texto de las cartas.
- Priorizá cartas que no estén en recently_seen_card_ids.
- Evitá repetir prácticas de recently_seen_groups y anatomías de recently_seen_anatomy, salvo que la reacción sea repeat_style.
- Cuando una candidata tenga uses_selected_inventory=true, significa que usa un elemento o juguete elegido por las personas. Hacé que esas cartas aparezcan regularmente y no dejes el inventario seleccionado como una configuración decorativa.
- Leé element_slugs y toy_slugs de cada candidata para saber exactamente qué recurso utiliza. Nunca elijas una carta que dependa de un recurso distinto al seleccionado.
- Si la penetración está disponible entre las candidatas y la partida ya está en una fase intensa o de pico, no la ignores sistemáticamente: alternala con oral, manos y juguetes sin convertirla en la única práctica.
- Si la reacción fue too_much, bajá intensidad o elegí recuperación.
- Si fue too_soft, elegí una carta sensiblemente más intensa y de un nivel superior cuando esté disponible.
- Si fue change_style, mantené una intensidad parecida, evitá el mismo grupo y buscá otra dinámica.
- Cerca del final, prepará un cierre coherente.

CONTINUIDAD DE ESCENA
- scene_state es la verdad actual de la partida: fase, estado físico, actividad activa, actividades completadas e inventario ya introducido.
- card_kind define la función real de cada carta. No cortes una acción sostenida con preguntas salvo que la lista no ofrezca continuidad y la fase lo justifique.
- scene_phase_min/max/after y physical_state_min/after son restricciones, no sugerencias.
- Si active_activity existe, favorecé activity_action continue o intensify sobre switch. Solo cambiá cuando allow_activity_change=true o la reacción pida change_style.
- inventory_action introduce/prepare/use/continue/replace/remove describe el ciclo de vida del elemento o juguete. No continúes un recurso que todavía no está en inventory_in_scene.
- Después de climax_reached, elegí cierre; no reinicies una práctica.
- Nunca selecciones más de dos preguntas consecutivas.
- La intensidad no determina la fase: una pregunta explícita puede aparecer temprano y una acción moderada puede requerir desnudez.

MODO SOLITARIO
- Cuando player_count sea 1 o mode_slug sea solitario, dirigite a una sola persona.
- Elegí cartas con play_scope solo o universal.
- Usá current_player_sex, anatomy_focus y penetration_method para elegir una propuesta natural para su anatomía.
- Aprovechá selected_toy_slugs y selected_element_slugs, pero no repitas siempre el mismo recurso.
- Alterná exploración corporal, excitación, estimulación directa, control, intensidad, clímax y cierre.
- No hables de pareja, equilibrio, turnos compartidos ni conexión entre dos personas.
- host_message debe estar en singular. Podés usar {{player}}, {{current_player}}, {{actor}}, {{actor_object}} y {{current_player_object}}.

MODO PARA DOS PERSONAS
- Usá current_player_sex, partner_sex, performer_sex, target_sex, anatomy_focus, anatomy_owner y penetration_method.
- Respetá quién realiza y quién recibe cada acción.
- Buscá continuidad y equilibrá la participación.
- host_message puede usar {{actor}}, {{target}}, {{partner}}, {{player1}}, {{player2}}, {{current_player}}, {{actor_object}} y {{target_object}}.

REGLAS DEL MENSAJE
- host_message debe ser breve, natural y sugerente. No menciones IA, algoritmos, filtros ni datos.
- Las variables se resuelven en el dispositivo. No inventes otras variables.
- Nunca escribas alternativas dobles como “lo o la”, “hacerlo o hacerla”, “desnudo o desnuda” o “juguetón/a”.
- No expliques tu razonamiento interno. Devolvé solo la estructura solicitada.
`.trim();

function eventForModel(event: SessionEvent | null) {
  if (!event) return null;
  return {
    result: event.result,
    reaction: event.reaction,
    player_index: event.player_index,
    intensity: event.intensity,
    continuity_group: event.continuity_group,
    scene_role: event.scene_role,
  };
}

function candidateForModel(candidate: Candidate) {
  return {
    id: candidate.id,
    text: candidate.text,
    level_order: candidate.level_order,
    intensity: candidate.intensity,
    play_scope: candidate.play_scope,
    performer: candidate.performer,
    target: candidate.target,
    performer_sex: candidate.performer_sex,
    target_sex: candidate.target_sex,
    anatomy_focus: candidate.anatomy_focus,
    anatomy_owner: candidate.anatomy_owner,
    penetration_method: candidate.penetration_method,
    reciprocal_action: candidate.reciprocal_action,
    element_slugs: candidate.element_slugs,
    toy_slugs: candidate.toy_slugs,
    uses_selected_inventory: candidate.uses_selected_inventory,
    contains_penetration: candidate.contains_penetration,
    contains_toy: candidate.contains_toy,
    contains_oral: candidate.contains_oral,
    contains_manual_stimulation: candidate.contains_manual_stimulation,
    tags: candidate.tags,
    gm_escalation_score: candidate.gm_escalation_score,
    gm_energy_score: candidate.gm_energy_score,
    gm_intimacy_score: candidate.gm_intimacy_score,
    gm_recovery_score: candidate.gm_recovery_score,
    gm_novelty_score: candidate.gm_novelty_score,
    gm_continuity_group: candidate.gm_continuity_group,
    gm_scene_role: candidate.gm_scene_role,
    card_kind: candidate.card_kind,
    scene_phase_min: candidate.scene_phase_min,
    scene_phase_max: candidate.scene_phase_max,
    scene_phase_after: candidate.scene_phase_after,
    physical_state_min: candidate.physical_state_min,
    physical_state_after: candidate.physical_state_after,
    activity_family: candidate.activity_family,
    activity_action: candidate.activity_action,
    requires_previous_activity: candidate.requires_previous_activity,
    forbidden_after_activity: candidate.forbidden_after_activity,
    allow_activity_change: candidate.allow_activity_change,
    inventory_action: candidate.inventory_action,
    variant_group: candidate.variant_group,
  };
}

export function buildDirectorInput(
  request: NextRequest,
  customPrompt?: string | null,
) {
  const stable = customPrompt?.trim()
    ? `${DIRECTOR_PROMPT}\n\nINDICACIONES EDITORIALES ADICIONALES\n${customPrompt.trim()}`
    : DIRECTOR_PROMPT;

  // Minimización de datos: el proveedor recibe solo contexto necesario para
  // seleccionar una carta, nunca IDs de sesión/evento/cuenta ni timestamps.
  const variable = {
    session: {
      mode_slug: request.mode_slug,
      player_count: request.player_count,
      resolved_count: request.resolved_count,
      max_cards: request.max_cards,
      progress: request.max_cards > 0 ? request.resolved_count / request.max_cards : 0,
      current_player: request.current_player,
      current_phase: request.current_phase,
      current_tension: request.current_tension,
      current_energy: request.current_energy,
      scene_state: request.scene_state,
    },
    compatibility: {
      player_sexes: request.player_sexes,
      current_player_sex: request.current_player_sex,
      partner_sex: request.partner_sex,
      selected_toy_slugs: request.selected_toy_slugs,
      selected_element_slugs: request.selected_element_slugs,
      recently_seen_card_ids: request.recently_seen_card_ids,
      recently_seen_groups: request.recently_seen_groups,
      recently_seen_anatomy: request.recently_seen_anatomy,
    },
    recent_events: request.recent_events.map(eventForModel),
    resolved_event: eventForModel(request.resolved_event),
    candidates: request.candidates.map(candidateForModel),
  };

  return [
    { role: "system" as const, content: stable },
    {
      role: "user" as const,
      content: `Estado de la partida y cartas válidas:\n${JSON.stringify(variable)}`,
    },
  ];
}

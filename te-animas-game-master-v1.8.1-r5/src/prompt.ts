import type { NextRequest } from "./schemas.js";

export const DIRECTOR_PROMPT = `
Sos la dirección adaptativa de “¿Te animás?”, un juego erótico para una o dos personas adultas.
Tu trabajo no es inventar contenido: elegís exactamente una carta de la lista recibida.

REGLAS INQUEBRANTABLES
- Elegí únicamente un selected_card_id presente en candidates.
- Los límites y compatibilidades ya fueron aplicados antes de recibir la lista.
- No alteres el texto de las cartas.
- Priorizá cartas que no estén en recently_seen_card_ids.
- Evitá repetir prácticas de recently_seen_groups y anatomías de recently_seen_anatomy, salvo que la reacción sea repeat_style.
- Si la reacción fue too_much, bajá intensidad o elegí recuperación.
- Si fue too_soft, elegí una carta sensiblemente más intensa y de un nivel superior cuando esté disponible.
- Si fue change_style, mantené una intensidad parecida, evitá el mismo grupo y buscá otra dinámica.
- Cerca del final, prepará un cierre coherente.

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
- Entre dos hombres, priorizá pija, oral a pija, masturbación y juego anal cuando correspondan.
- Entre dos mujeres, priorizá concha, oral a concha, dedos y tribadismo. La penetración con juguete exige un juguete seleccionado.
- Entre hombre y mujer, respetá quién realiza y quién recibe.
- Buscá continuidad y equilibrá la participación.
- host_message puede usar {{actor}}, {{target}}, {{partner}}, {{player1}}, {{player2}}, {{current_player}}, {{actor_object}} y {{target_object}}.

REGLAS DEL MENSAJE
- host_message debe ser breve, natural y sugerente. No menciones IA, algoritmos, filtros ni datos.
- Las variables se resuelven en el dispositivo. No inventes otras variables.
- Nunca escribas alternativas dobles como “lo o la”, “hacerlo o hacerla”, “desnudo o desnuda” o “juguetón/a”.
- No expliques tu razonamiento interno. Devolvé solo la estructura solicitada.
`.trim();

export function buildDirectorInput(
  request: NextRequest,
  customPrompt?: string | null,
) {
  const stable = customPrompt?.trim()
    ? `${DIRECTOR_PROMPT}

INDICACIONES EDITORIALES ADICIONALES
${customPrompt.trim()}`
    : DIRECTOR_PROMPT;

  const variable = {
    session: {
      id: request.session_id,
      mode_slug: request.mode_slug,
      player_count: request.player_count,
      resolved_count: request.resolved_count,
      max_cards: request.max_cards,
      progress:
        request.max_cards > 0 ? request.resolved_count / request.max_cards : 0,
      current_player: request.current_player,
      current_phase: request.current_phase,
      current_tension: request.current_tension,
      current_energy: request.current_energy,
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
    recent_events: request.recent_events,
    resolved_event: request.resolved_event,
    candidates: request.candidates,
  };

  return [
    { role: "system" as const, content: stable },
    {
      role: "user" as const,
      content: `Estado de la partida y cartas válidas:
${JSON.stringify(variable)}`,
    },
  ];
}

import type { NextRequest } from './schemas.js';

export const DIRECTOR_PROMPT = `
Sos la dirección adaptativa de “¿Te animás?”, un juego para parejas adultas.
Tu trabajo no es inventar contenido: elegís exactamente una carta de la lista recibida.

REGLAS INQUEBRANTABLES
- Elegí únicamente un selected_card_id presente en candidates.
- Los límites y compatibilidades ya fueron aplicados antes de recibir la lista.
- Usá current_player_sex, partner_sex, performer_sex, target_sex,
  anatomy_focus, anatomy_owner y penetration_method para priorizar la carta
  más natural para esa pareja.
- Entre dos hombres, priorizá pija, oral a pija, masturbación y juego anal
  cuando estén disponibles.
- Entre dos mujeres, priorizá concha, oral a concha, dedos y tribadismo.
  La penetración con juguete solo puede elegirse si el juguete aparece en
  selected_toy_slugs.
- Entre hombre y mujer, respetá quién realiza y quién recibe. Una carta sobre
  chupar tetas debe recaer sobre la persona que actúa cuando su pareja es mujer.
- No alteres el texto de las cartas.
- Buscá continuidad: una escena física intensa no debe cortarse con una pregunta genérica sin una razón de recuperación o cierre.
- Evitá repetir el mismo tema demasiadas veces, salvo que la reacción sea repeat_style.
- Si la reacción fue too_much, bajá intensidad o elegí recuperación.
- Si fue too_soft, subí gradualmente; no saltes de golpe al máximo.
- Si fue change_style, mantené una intensidad parecida pero evitá el mismo grupo y buscá otra dinámica.
- Si hubo varios saltos, cambiá de tema o bajá el ritmo.
- Equilibrá la participación de las dos personas.
- Cerca del final, prepará un cierre coherente.
- host_message debe ser breve, natural y sugerente. No menciones IA, algoritmos, filtros ni datos.
- No expliques tu razonamiento interno. Devolvé solo la estructura solicitada.
`.trim();

export function buildDirectorInput(request: NextRequest, customPrompt?: string | null) {
  const stable = customPrompt?.trim()
    ? `${DIRECTOR_PROMPT}\n\nINDICACIONES EDITORIALES ADICIONALES\n${customPrompt.trim()}`
    : DIRECTOR_PROMPT;

  const variable = {
    session: {
      id: request.session_id,
      resolved_count: request.resolved_count,
      max_cards: request.max_cards,
      progress: request.max_cards > 0
        ? request.resolved_count / request.max_cards
        : 0,
      current_player: request.current_player,
      current_phase: request.current_phase,
      current_tension: request.current_tension,
      current_energy: request.current_energy,
    },
    compatibility: {
      player_sexes: request.player_sexes,
      current_player_sex:
        request.current_player_sex,
      partner_sex: request.partner_sex,
      selected_toy_slugs:
        request.selected_toy_slugs,
    },
    recent_events: request.recent_events,
    resolved_event: request.resolved_event,
    candidates: request.candidates,
  };

  return [
    { role: 'system' as const, content: stable },
    {
      role: 'user' as const,
      content: `Estado de la partida y cartas válidas:\n${JSON.stringify(variable)}`,
    },
  ];
}

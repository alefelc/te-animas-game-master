function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function lastEvent(request) {
    return request.resolved_event ?? request.recent_events.at(-1) ?? null;
}
function targetIntensity(request) {
    const progress = request.max_cards > 0 ? request.resolved_count / request.max_cards : 0;
    let target = 1.4 + progress * 5.2;
    const event = lastEvent(request);
    const recentIntensityRequests = request.recent_events
        .slice(-4)
        .filter((item) => item.reaction === "too_soft").length;
    if (event?.reaction === "too_soft") {
        target += 2.8 + Math.min(1.8, recentIntensityRequests * 0.9);
    }
    if (event?.reaction === "too_much")
        target -= 1.8;
    if (event?.result === "skipped")
        target -= 0.6;
    return clamp(target, 1, 6);
}
function phaseFor(request, event) {
    const progress = request.max_cards > 0 ? request.resolved_count / request.max_cards : 0;
    if (event?.reaction === "too_much")
        return "recovery";
    if (progress >= 0.88)
        return "closing";
    if (progress >= 0.7)
        return "peak";
    if (progress >= 0.42)
        return "intense";
    if (progress >= 0.18)
        return "build";
    return "warmup";
}
function strategyFor(phase, event) {
    if (phase === "closing")
        return "close_session";
    if (phase === "recovery")
        return "slow_down";
    if (event?.reaction === "repeat_style")
        return "continue_scene";
    if (event?.reaction === "change_style")
        return "change_style";
    if (event?.reaction === "too_soft")
        return "escalate";
    if (phase === "peak")
        return "prepare_climax";
    return "continue_scene";
}
function scoreCandidate(candidate, request, target, phase, event) {
    let score = 20 - Math.abs(candidate.intensity - target) * 4;
    const candidateWeight = candidate.weight ?? 100;
    score += Math.min(10, Math.max(0, candidateWeight / 100 - 1) * 3);
    if (candidate.uses_selected_inventory) {
        score += 8;
    }
    if (event?.continuity_group &&
        candidate.gm_continuity_group === event.continuity_group) {
        if (event.reaction === "repeat_style")
            score += 9;
        else if (event.reaction === "change_style")
            score -= 14;
        else
            score += 4;
    }
    if (event?.reaction === "change_style" &&
        candidate.gm_continuity_group !== event.continuity_group) {
        score += 4 + candidate.gm_novelty_score;
    }
    if (event?.reaction === "too_much") {
        score += candidate.gm_recovery_score * 2.2;
        score -= Math.max(0, candidate.gm_escalation_score) * 3;
    }
    if (event?.reaction === "too_soft") {
        score += candidate.gm_escalation_score * 5;
        score += Math.max(0, candidate.intensity - (event.intensity || 0)) * 4;
        score += candidate.gm_scene_role === "climax" ? 5 : 0;
    }
    if (event?.result === "skipped") {
        if (event.continuity_group &&
            candidate.gm_continuity_group === event.continuity_group) {
            score -= 5;
        }
    }
    if (phase === "closing") {
        score += candidate.gm_scene_role === "closer" ? 12 : 0;
        score += candidate.gm_recovery_score * 1.5;
    }
    if (phase === "peak") {
        score += candidate.gm_scene_role === "climax" ? 10 : 0;
        score += candidate.contains_penetration ? 2.5 : 0;
    }
    if (phase === "warmup") {
        score += candidate.gm_scene_role === "starter" ? 8 : 0;
        score -= candidate.gm_escalation_score > 1 ? 5 : 0;
    }
    if (request.player_count === 1) {
        if (candidate.play_scope === "solo")
            score += 5;
        if (candidate.performer === "self" && candidate.target === "self")
            score += 3;
        if (candidate.reciprocal_action)
            score -= 20;
    }
    if (candidate.performer_sex || candidate.target_sex) {
        score += 2.5;
    }
    if (candidate.anatomy_focus !== "none" &&
        candidate.anatomy_focus !== "body") {
        score += 1;
    }
    if (candidate.penetration_method === "juguete" &&
        request.selected_toy_slugs.length === 0) {
        score -= 100;
    }
    if (request.current_player_sex === "hombre" &&
        request.partner_sex === "hombre" &&
        ["pija", "culo"].includes(candidate.anatomy_focus)) {
        score += 2;
    }
    if (request.current_player_sex === "mujer" &&
        request.partner_sex === "mujer" &&
        ["concha", "tetas"].includes(candidate.anatomy_focus)) {
        score += 2;
    }
    if ((request.recently_seen_card_ids ?? []).includes(candidate.id)) {
        score -= 28;
    }
    if (event?.reaction !== "repeat_style") {
        const repeatedGroup = (request.recently_seen_groups ?? []).filter((group) => group && group === candidate.gm_continuity_group).length;
        const repeatedAnatomy = (request.recently_seen_anatomy ?? []).filter((anatomy) => anatomy && anatomy === candidate.anatomy_focus).length;
        score -= Math.min(18, repeatedGroup * 2.2);
        if (candidate.anatomy_focus !== "none" &&
            candidate.anatomy_focus !== "body") {
            score -= Math.min(9, repeatedAnatomy * 0.9);
        }
    }
    score += candidate.gm_novelty_score * 0.8;
    score += Math.random() * 1.5;
    return score;
}
export function chooseFallback(request) {
    const event = lastEvent(request);
    const target = targetIntensity(request);
    const phase = phaseFor(request, event);
    const strategy = strategyFor(phase, event);
    const selected = [...request.candidates].sort((a, b) => scoreCandidate(b, request, target, phase, event) -
        scoreCandidate(a, request, target, phase, event))[0];
    if (!selected) {
        throw new Error("No hay cartas candidatas.");
    }
    const coupleMessages = {
        warmup: "Arranquen sin apuro. Dejen que la tensión aparezca sola.",
        build: "La partida empieza a tomar temperatura.",
        intimate: "Ahora importa más la conexión que la velocidad.",
        intense: "Sigan el ritmo: todavía no es momento de cortar la escena.",
        recovery: "Bajen un cambio y vuelvan a encontrarse.",
        peak: "Llegó el momento de ir un poco más lejos.",
        closing: "Cierren la partida con una última escena que tenga sentido.",
    };
    const soloMessages = {
        warmup: "{{player}}, empezá sin apuro y prestá atención a tu cuerpo.",
        build: "La intensidad empieza a subir. Seguí a tu ritmo.",
        intimate: "Concentrate en la sensación, no en la velocidad.",
        intense: "Sostené el ritmo y dejá que la excitación crezca.",
        recovery: "Bajá un cambio, respirá y cambiá de zona.",
        peak: "Estás cerca del punto más intenso de la sesión.",
        closing: "Terminá con una última sensación que quieras recordar.",
    };
    const messages = request.player_count === 1 ? soloMessages : coupleMessages;
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
//# sourceMappingURL=fallback.js.map
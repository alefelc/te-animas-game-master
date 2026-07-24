import { describe, expect, it } from "vitest";
import { CandidateSchema, NextRequestSchema } from "../src/schemas.js";

describe("contrato v5 compatible con catálogo actual", () => {
  it("acepta y normaliza puntajes de 1 a 10", () => {
    const candidate = CandidateSchema.parse({
      id: "card-1",
      code: "DIAG-001",
      text: "Carta de prueba",
      intensity: 7,
      gm_escalation_score: 9,
      gm_energy_score: 9,
      gm_intimacy_score: 8,
      gm_humor_score: 0,
      gm_recovery_score: 5,
      gm_novelty_score: 5,
    });

    expect(candidate.gm_escalation_score).toBe(3);
    expect(candidate.gm_energy_score).toBe(5);
    expect(candidate.gm_intimacy_score).toBe(4);
  });

  it("acepta una solicitud completa con puntajes altos del catálogo", () => {
    const request = NextRequestSchema.parse({
      game_id: "game-1",
      session_id: "session-1",
      mode_id: "mode-1",
      candidates: [
        {
          id: "card-1",
          code: "SOLO-001",
          text: "Carta de prueba",
          intensity: 7,
          play_scope: "solo",
          performer: "current_player",
          target: "current_player",
          gm_escalation_score: 8,
          gm_energy_score: 9,
          gm_intimacy_score: 9,
        },
      ],
    });

    expect(request.candidates[0]?.gm_energy_score).toBe(5);
    expect(request.candidates[0]?.gm_escalation_score).toBe(3);
  });
});

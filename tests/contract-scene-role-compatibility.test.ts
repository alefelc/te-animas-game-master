import { describe, expect, it } from "vitest";
import {
  CandidateSchema,
  NextRequestSchema,
  normalizeSceneRole,
} from "../src/schemas.js";

const expectedRoles = [
  "starter",
  "bridge",
  "continuation",
  "climax",
  "recovery",
  "closer",
];

describe("contrato v6 compatible con roles históricos", () => {
  it.each([
    ["warmup", "starter"],
    ["inicio", "starter"],
    ["escalation", "bridge"],
    ["transition", "bridge"],
    ["build", "continuation"],
    ["continuación", "continuation"],
    ["peak", "climax"],
    ["orgasmo", "climax"],
    ["aftercare", "recovery"],
    ["recuperación", "recovery"],
    ["closing", "closer"],
    ["cierre", "closer"],
  ])("normaliza %s como %s", (input, expected) => {
    expect(normalizeSceneRole(input)).toBe(expected);
  });

  it("infiere valores personalizados sin rechazar la carta", () => {
    const parsed = CandidateSchema.parse({
      id: "custom-role-card",
      code: "CUSTOM-ROLE",
      text: "Carta con un rol personalizado",
      level_order: 5,
      intensity: 7,
      gm_scene_role: "sensual-loop-v2",
    });

    expect(parsed.gm_scene_role).toBe("continuation");
  });

  it("acepta una partida personalizada con roles mixtos y desconocidos", () => {
    const roleInputs: unknown[] = [
      "starter",
      "escalation",
      "sustain",
      "payoff",
      "aftercare",
      "ending",
      "continuación",
      "transición",
      "custom-role",
      "",
      null,
      17,
    ];

    const request = NextRequestSchema.parse({
      game_id: "custom-game",
      session_id: "custom-session",
      mode_id: "personalizada",
      candidates: roleInputs.map((gm_scene_role, index) => ({
        id: `card-${index}`,
        code: `CUSTOM-${index}`,
        text: `Carta personalizada ${index}`,
        level_order: Math.min(7, Math.max(1, index + 1)),
        intensity: Math.min(10, index + 1),
        gm_scene_role,
      })),
    });

    expect(request.candidates).toHaveLength(roleInputs.length);
    for (const candidate of request.candidates) {
      expect(expectedRoles).toContain(candidate.gm_scene_role);
    }
  });
});

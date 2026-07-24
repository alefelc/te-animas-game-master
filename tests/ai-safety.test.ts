import { describe, expect, it } from "vitest";
import { hardenDirectorDecision, sanitizeHostMessage } from "../src/ai-safety.js";
import { buildDirectorInput } from "../src/prompt.js";
import { NextRequestSchema } from "../src/schemas.js";

const candidate = {
  id: "card-1",
  code: "secret-editorial-code",
  text: "Una carta válida",
  level_id: "level-private-id",
  level_order: 2,
  intensity: 2,
};

const request = NextRequestSchema.parse({
  game_id: "game-private-id",
  session_id: "session-private-id",
  mode_id: "mode-private-id",
  player_count: 1,
  max_cards: 10,
  recent_events: [{
    id: "event-private-id",
    card_id: "previous-card-private-id",
    result: "completed",
    reaction: "liked",
    player_index: 0,
    intensity: 2,
    created_at: "2026-07-23T12:00:00.000Z",
  }],
  candidates: [candidate],
});

describe("AI boundary", () => {
  it("minimizes identifiers sent to the model", () => {
    const input = JSON.stringify(buildDirectorInput(request));
    expect(input).not.toContain("session-private-id");
    expect(input).not.toContain("event-private-id");
    expect(input).not.toContain("previous-card-private-id");
    expect(input).not.toContain("game-private-id");
    expect(input).not.toContain("mode-private-id");
    expect(input).not.toContain("secret-editorial-code");
    expect(input).not.toContain("level-private-id");
    expect(input).toContain("card-1");
  });

  it("rejects technical leakage and unknown variables", () => {
    expect(sanitizeHostMessage("La IA eligió selected_card_id", "build", 2)).toBe(
      "La partida empieza a tomar temperatura.",
    );
    expect(sanitizeHostMessage("{{player}} seguí {{password}} ahora", "build", 1)).toBe(
      "{{player}} seguí ahora",
    );
  });

  it("does not let the model close a scene before climax", () => {
    const decision = hardenDirectorDecision(
      {
        selected_card_id: "card-1",
        phase: "closing",
        strategy: "close_session",
        target_tension: 60,
        target_energy: 60,
        host_message: "Cierren ahora.",
        confidence: 0.9,
      },
      request,
      request.candidates[0]!,
    );
    expect(decision.phase).not.toBe("closing");
    expect(decision.strategy).not.toBe("close_session");
  });

});

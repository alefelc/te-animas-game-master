import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DIRECTUS_URL = "https://admin.example.com";
  process.env.DIRECTUS_TOKEN = "server-token";
  process.env.OPENAI_API_KEY = "";
  process.env.PUBLIC_APP_URL = "https://teanimas.com/";
  process.env.COUPLE_INVITE_PEPPER = "test-pepper-that-is-not-public";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function requestDetails(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const headers = new Headers(init?.headers);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  return { url, headers, body, method: init?.method ?? "GET" };
}

describe("vinculación privada de pareja", () => {
  it("guarda únicamente el hash del código de invitación", async () => {
    const calls: Array<ReturnType<typeof requestDetails>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const call = requestDetails(input, init);
      calls.push(call);
      if (call.url.pathname === "/users/me") {
        return Response.json({ data: { id: "user-1" } });
      }
      if (call.url.pathname === "/items/pc_couple_members") {
        return Response.json({ data: [] });
      }
      if (call.url.pathname === "/items/pc_couple_invites" && call.method === "GET") {
        return Response.json({ data: [] });
      }
      if (call.url.pathname === "/items/pc_couple_invites" && call.method === "POST") {
        return Response.json({ data: call.body });
      }
      return Response.json({ errors: [{ message: "Ruta inesperada" }] }, { status: 404 });
    }));

    const { createCoupleInvite } = await import("../src/couples.js");
    const invite = await createCoupleInvite("player-token", { expires_in_days: 3 });
    const stored = calls.find(
      (call) => call.url.pathname === "/items/pc_couple_invites" && call.method === "POST",
    )?.body as { code_hash?: string } | undefined;

    expect(invite.code).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(stored?.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.code_hash).not.toContain(invite.code);
    expect(JSON.stringify(stored)).not.toContain(invite.code);
    expect(invite.link).toContain(encodeURIComponent(invite.code));
    expect(invite.link).toContain("#couple_code=");
    expect(invite.link).not.toContain("?couple_code=");
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer player-token");
    expect(calls.slice(1).every((call) => call.headers.get("Authorization") === "Bearer server-token")).toBe(true);
  });

  it("revela solo coincidencias positivas y nunca las respuestas privadas", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const call = requestDetails(input, init);
      if (call.url.pathname === "/users/me") {
        return Response.json({ data: { id: "user-1" } });
      }
      if (call.url.pathname === "/items/pc_couple_members") {
        if (call.url.searchParams.get("filter[user][_eq]")) {
          return Response.json({
            data: [{ id: "m1", couple: "couple-1", user: "user-1", role: "owner" }],
          });
        }
        return Response.json({
          data: [
            { id: "m1", couple: "couple-1", user: "user-1", role: "owner" },
            { id: "m2", couple: "couple-1", user: "user-2", role: "partner" },
          ],
        });
      }
      if (call.url.pathname === "/items/pc_couples/couple-1") {
        return Response.json({ data: { id: "couple-1", status: "active", preferences_revision: 0 } });
      }
      if (call.url.pathname === "/items/pc_couple_card_signals") {
        return Response.json({
          data: [
            { id: "1", couple: "couple-1", user: "user-1", card_id: "card-negative", response: "interested", date_updated: "2026-07-20T10:00:00Z" },
            { id: "2", couple: "couple-1", user: "user-2", card_id: "card-negative", response: "no", date_updated: "2026-07-20T10:01:00Z" },
            { id: "3", couple: "couple-1", user: "user-1", card_id: "card-talk", response: "maybe", date_updated: "2026-07-20T10:02:00Z" },
            { id: "4", couple: "couple-1", user: "user-2", card_id: "card-talk", response: "interested", date_updated: "2026-07-20T10:03:00Z" },
            { id: "5", couple: "couple-1", user: "user-1", card_id: "card-match", response: "favorite", date_updated: "2026-07-20T10:04:00Z" },
            { id: "6", couple: "couple-1", user: "user-2", card_id: "card-match", response: "repeat", date_updated: "2026-07-20T10:05:00Z" },
            { id: "7", couple: "couple-1", user: "user-1", card_id: "card-pending", response: "interested", date_updated: "2026-07-20T10:06:00Z" },
          ],
        });
      }
      return Response.json({ errors: [{ message: "Ruta inesperada" }] }, { status: 404 });
    }));

    const { readPrivateMatches } = await import("../src/couples.js");
    const result = await readPrivateMatches("player-token");

    expect(result).toEqual([
      { card_id: "card-match", kind: "match", matched_at: "2026-07-20T10:05:00Z" },
      { card_id: "card-talk", kind: "talk", matched_at: "2026-07-20T10:03:00Z" },
    ]);
    expect(JSON.stringify(result)).not.toContain("card-negative");
    expect(JSON.stringify(result)).not.toContain('"response"');
  });

  it("no convierte un fallo real de actualización en una creación duplicada", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const call = requestDetails(input, init);
      if (call.url.pathname === "/users/me") {
        return Response.json({ data: { id: "user-1" } });
      }
      if (call.url.pathname === "/items/pc_couple_members") {
        return Response.json({
          data: [{ id: "m1", couple: "couple-1", user: "user-1", role: "owner" }],
        });
      }
      if (call.url.pathname === "/items/pc_couples/couple-1") {
        return Response.json({ data: { id: "couple-1", status: "active", preferences_revision: 0 } });
      }
      if (call.url.pathname.startsWith("/items/pc_couple_card_signals/")) {
        methods.push(call.method);
        return Response.json({ errors: [{ message: "Database unavailable" }] }, { status: 503 });
      }
      if (call.url.pathname === "/items/pc_couple_card_signals") {
        methods.push(call.method);
        return Response.json({ data: call.body });
      }
      return Response.json({ errors: [{ message: "Ruta inesperada" }] }, { status: 404 });
    }));

    const { putCardSignal } = await import("../src/couples.js");
    await expect(
      putCardSignal("player-token", "11111111-1111-4111-8111-111111111111", {
        response: "favorite",
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(methods).toEqual(["PATCH"]);
  });

  it("rechaza una escritura compartida basada en una revisión vieja", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const call = requestDetails(input, init);
      if (call.url.pathname === "/users/me") return Response.json({ data: { id: "user-1" } });
      if (call.url.pathname === "/items/pc_couple_members") {
        return Response.json({ data: [{ id: "m1", couple: "couple-1", user: "user-1", role: "owner" }] });
      }
      if (call.url.pathname === "/items/pc_couples/couple-1") {
        return Response.json({ data: { id: "couple-1", status: "active", preferences_revision: 4 } });
      }
      return Response.json({ errors: [{ message: "Ruta inesperada" }] }, { status: 404 });
    }));

    const { updateCouplePreferences } = await import("../src/couples.js");
    await expect(updateCouplePreferences("player-token", {
      preferences: null,
      expected_revision: 3,
    })).rejects.toMatchObject({ status: 409, code: "COUPLE_PREFERENCES_CONFLICT" });
  });

});

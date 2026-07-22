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

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    user: "user-1",
    preferences: null,
    couple_id: null,
    partner_user: null,
    couple_role: null,
    couple_status: null,
    linked_at: null,
    shared_preferences: null,
    couple_signals: null,
    couple_history: null,
    invite_code_hash: null,
    invite_expires_at: null,
    invite_status: null,
    invite_used_by: null,
    ...overrides,
  };
}

describe("vinculación privada compacta de pareja", () => {
  it("guarda únicamente el hash del código dentro del perfil existente", async () => {
    const calls: Array<ReturnType<typeof requestDetails>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const call = requestDetails(input, init);
      calls.push(call);
      if (call.url.pathname === "/users/me") {
        return Response.json({ data: { id: "user-1" } });
      }
      if (call.url.pathname === "/items/pc_user_profiles" && call.method === "GET") {
        return Response.json({ data: [profile()] });
      }
      if (call.url.pathname === "/items/pc_user_profiles/profile-1" && call.method === "PATCH") {
        return Response.json({ data: profile(call.body) });
      }
      return Response.json({ errors: [{ message: "Ruta inesperada" }] }, { status: 404 });
    }));

    const { createCoupleInvite } = await import("../src/couples.js");
    const invite = await createCoupleInvite("player-token", { expires_in_days: 3 });
    const stored = calls.find(
      (call) => call.url.pathname === "/items/pc_user_profiles/profile-1" && call.method === "PATCH",
    )?.body as { invite_code_hash?: string } | undefined;

    expect(invite.code).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(stored?.invite_code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.invite_code_hash).not.toContain(invite.code);
    expect(JSON.stringify(stored)).not.toContain(invite.code);
    expect(invite.link).toContain(encodeURIComponent(invite.code));
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer player-token");
    expect(calls.slice(1).every((call) => call.headers.get("Authorization") === "Bearer server-token")).toBe(true);
    expect(calls.some((call) => call.url.pathname.includes("pc_couple_"))).toBe(false);
  });

  it("revela solo coincidencias positivas y nunca las respuestas privadas", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const call = requestDetails(input, init);
      if (call.url.pathname === "/users/me") {
        return Response.json({ data: { id: "user-1" } });
      }
      if (call.url.pathname === "/items/pc_user_profiles") {
        const user = call.url.searchParams.get("filter[user][_eq]");
        if (user === "user-1") {
          return Response.json({ data: [profile({
            couple_id: "couple-1",
            partner_user: "user-2",
            couple_role: "owner",
            couple_status: "active",
            couple_signals: {
              "card-negative": { response: "interested", updated_at: "2026-07-20T10:00:00Z" },
              "card-talk": { response: "maybe", updated_at: "2026-07-20T10:02:00Z" },
              "card-match": { response: "favorite", updated_at: "2026-07-20T10:04:00Z" },
              "card-pending": { response: "interested", updated_at: "2026-07-20T10:06:00Z" },
            },
          })] });
        }
        if (user === "user-2") {
          return Response.json({ data: [profile({
            id: "profile-2",
            user: "user-2",
            couple_id: "couple-1",
            partner_user: "user-1",
            couple_role: "partner",
            couple_status: "active",
            couple_signals: {
              "card-negative": { response: "no", updated_at: "2026-07-20T10:01:00Z" },
              "card-talk": { response: "interested", updated_at: "2026-07-20T10:03:00Z" },
              "card-match": { response: "repeat", updated_at: "2026-07-20T10:05:00Z" },
            },
          })] });
        }
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

  it("propaga un fallo real al guardar una señal sin crear registros alternativos", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const call = requestDetails(input, init);
      if (call.url.pathname === "/users/me") {
        return Response.json({ data: { id: "user-1" } });
      }
      if (call.url.pathname === "/items/pc_user_profiles" && call.method === "GET") {
        return Response.json({ data: [profile({
          couple_id: "couple-1",
          partner_user: "user-2",
          couple_role: "owner",
          couple_status: "active",
          couple_signals: {},
        })] });
      }
      if (call.url.pathname === "/items/pc_user_profiles/profile-1") {
        methods.push(call.method);
        return Response.json({ errors: [{ message: "Database unavailable" }] }, { status: 503 });
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
});

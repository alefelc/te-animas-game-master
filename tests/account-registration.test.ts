import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DIRECTUS_URL = "https://admin.example.com";
  process.env.DIRECTUS_TOKEN = "server-token";
  process.env.PLAYER_ROLE_ID = "11111111-1111-4111-8111-111111111111";
  process.env.ACCOUNT_INVITE_URL = "https://teanimas.com/?auth=accept-invite";
  process.env.OPENAI_API_KEY = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registro por invitación R19", () => {
  it("crea usuario invited y envía invitación con el rol configurado", async () => {
    const calls: Array<{ path: string; method: string; body: unknown; authorization: string | null }> = [];

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ path: `${url.pathname}${url.search}`, method, body, authorization: headers.get("Authorization") });

      if (url.pathname === "/users" && method === "GET") return Response.json({ data: [] });
      if (url.pathname === "/users" && method === "POST") return Response.json({ data: { id: "user-1" } });
      if (url.pathname === "/users/invite" && method === "POST") return new Response(null, { status: 204 });
      return Response.json({ errors: [{ message: "Ruta inesperada" }] }, { status: 404 });
    }));

    const { inviteAccountUser } = await import("../src/directus.js");
    await inviteAccountUser({ email: "Jugador@Example.com", first_name: "Ale", last_name: "Prueba" });

    expect(calls.every((call) => call.authorization === "Bearer server-token")).toBe(true);
    expect(calls[1]).toMatchObject({
      path: "/users",
      method: "POST",
      body: {
        email: "jugador@example.com",
        first_name: "Ale",
        last_name: "Prueba",
        role: "11111111-1111-4111-8111-111111111111",
        status: "invited",
      },
    });
    expect(calls[2]).toMatchObject({
      path: "/users/invite",
      method: "POST",
      body: {
        email: "jugador@example.com",
        role: "11111111-1111-4111-8111-111111111111",
        invite_url: "https://teanimas.com/?auth=accept-invite",
      },
    });
  });

  it("no modifica ni re-invita una cuenta ya activa", async () => {
    const calls: Array<{ path: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      calls.push({ path: url.pathname, method: init?.method ?? "GET" });
      return Response.json({ data: [{ id: "user-1", email: "x@example.com", status: "active", role: "role" }] });
    }));

    const { inviteAccountUser } = await import("../src/directus.js");
    await inviteAccountUser({ email: "x@example.com", first_name: "Otro", last_name: "Nombre" });
    expect(calls).toEqual([{ path: "/users", method: "GET" }]);
  });

  it("valida el payload público sin aceptar campos extra", async () => {
    const { RegisterAccountSchema } = await import("../src/account.js");
    expect(RegisterAccountSchema.parse({ email: "a@example.com", first_name: "A", last_name: "B" })).toEqual({
      email: "a@example.com",
      first_name: "A",
      last_name: "B",
    });
    expect(() => RegisterAccountSchema.parse({ email: "a@example.com", first_name: "A", last_name: "B", role: "admin" })).toThrow();
  });
});

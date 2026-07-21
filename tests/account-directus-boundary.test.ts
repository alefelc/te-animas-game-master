import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DIRECTUS_URL = "https://admin.example.com";
  process.env.DIRECTUS_TOKEN = "server-token";
  process.env.OPENAI_API_KEY = "";
  process.env.PLAYER_ROLE_ID = "11111111-1111-4111-8111-111111111111";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("frontera privada de perfiles", () => {
  it("usa el token del jugador solo para identificarlo y el token del servidor para sus datos", async () => {
    const calls: Array<{ path: string; authorization: string | null; body: unknown }> = [];

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const headers = new Headers(init?.headers);
      let body: unknown = null;
      if (typeof init?.body === "string") body = JSON.parse(init.body);
      calls.push({ path: `${url.pathname}${url.search}`, authorization: headers.get("Authorization"), body });

      if (url.pathname === "/users/me") {
        return Response.json({ data: { id: "user-1" } });
      }
      if (url.pathname === "/users/user-1") {
        return Response.json({
          data: {
            id: "user-1",
            email: "jugador@example.com",
            first_name: "Ale",
            last_name: "Prueba",
            status: "active",
          },
        });
      }
      if (url.pathname === "/items/pc_user_profiles" && init?.method !== "POST") {
        return Response.json({ data: [] });
      }
      if (url.pathname === "/items/pc_user_profiles" && init?.method === "POST") {
        return Response.json({ data: { id: 1, user: "user-1", preferences: body && (body as { preferences?: unknown }).preferences } });
      }
      return Response.json({ errors: [{ message: "Ruta inesperada" }] }, { status: 404 });
    }));

    const directus = await import("../src/directus.js");
    const userId = await directus.authenticateAccountToken("player-access-token");
    const user = await directus.readAccountUser(userId);
    const profile = await directus.saveAccountProfile(userId, { version: 1 });

    expect(user.email).toBe("jugador@example.com");
    expect(profile.user).toBe("user-1");
    expect(calls[0]).toMatchObject({
      path: "/users/me?fields=id",
      authorization: "Bearer player-access-token",
    });
    expect(calls.slice(1).every((call) => call.authorization === "Bearer server-token")).toBe(true);
    expect(calls.at(-1)?.body).toEqual({ user: "user-1", preferences: { version: 1 } });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user-a", email: "ale@example.test", first_name: "Ale", last_name: null, status: "active" };
const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DIRECTUS_URL", "https://directus.test");
  vi.stubEnv("DIRECTUS_TOKEN", "server-token-not-a-real-secret");
  vi.stubEnv("COUPLE_INVITE_PEPPER", "");
  vi.stubEnv("PLAYER_ROLE_ID", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("arranque y cuentas independientes de funciones opcionales", () => {
  it.each(["", "short", "server-token-not-a-real-secret"])("inicia en producción con pepper inválido sin reutilizar token: %s", async (pepper) => {
    vi.stubEnv("COUPLE_INVITE_PEPPER", pepper);
    const { config } = await import("./config.js");
    expect(config.coupleInvitePepper).toBeNull();
    expect(config.playerRoleId).toBeNull();
  });

  it("acepta un secreto independiente de 32 caracteres", async () => {
    vi.stubEnv("COUPLE_INVITE_PEPPER", "a-valid-independent-secret-0123456789");
    expect((await import("./config.js")).config.coupleInvitePepper).toBe("a-valid-independent-secret-0123456789");
  });

  it("no permite usar DIRECTUS_TOKEN como pepper aunque tenga longitud suficiente", async () => {
    const secret = "a-long-server-token-not-for-invites-0123456789";
    vi.stubEnv("DIRECTUS_TOKEN", secret);
    vi.stubEnv("COUPLE_INVITE_PEPPER", secret);
    expect((await import("./config.js")).config.coupleInvitePepper).toBeNull();
  });

  it("bloquea creación/aceptación de invitaciones sin tocar Directus si falta el secreto", async () => {
    const mocked = vi.fn();
    vi.stubGlobal("fetch", mocked);
    const { createCoupleInvite, acceptCoupleInvite } = await import("./couples.js");
    await expect(createCoupleInvite("user-token", {})).rejects.toMatchObject({ status: 503, code: "COUPLE_INVITES_NOT_CONFIGURED" });
    await expect(acceptCoupleInvite("user-token", { code: "a".repeat(32) })).rejects.toMatchObject({ status: 503, code: "COUPLE_INVITES_NOT_CONFIGURED" });
    expect(mocked).not.toHaveBeenCalled();
  });

  it.each([500, 502, 503, 504, "network"] as const)("conserva identidad válida si el perfil falla con %s", async (status) => {
    const mocked = vi.fn(async (url: string) => {
      if (url.includes("/users/me?")) return json(user);
      if (status === "network") throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ errors: [{ message: "Internal error" }] }), { status });
    });
    vi.stubGlobal("fetch", mocked);
    const { readAccountBundle } = await import("./account.js");
    await expect(readAccountBundle("user-token")).resolves.toEqual({ user, profile: null, profile_available: false });
    expect(new Headers(mocked.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer user-token");
  });

  it("distingue un perfil vacío de una lectura fallida", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/users/me?") ? json(user) : json([])));
    await expect((await import("./account.js")).readAccountBundle("user-token")).resolves.toEqual({ user, profile: null, profile_available: true });
  });

  it("rechaza un token inválido antes de leer el perfil", async () => {
    const mocked = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "Invalid credentials", extensions: { code: "INVALID_CREDENTIALS" } }] }), { status: 401 }));
    vi.stubGlobal("fetch", mocked);
    await expect((await import("./account.js")).readAccountBundle("bad-token")).rejects.toMatchObject({ status: 401 });
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("no registra sin rol de jugadores configurado ni inventa uno", async () => {
    const mocked = vi.fn();
    vi.stubGlobal("fetch", mocked);
    const { registerAccount } = await import("./account.js");
    await expect(registerAccount({ email: "new@example.test", first_name: "New", last_name: "User" })).rejects.toMatchObject({ status: 503, code: "ACCOUNT_REGISTRATION_NOT_CONFIGURED" });
    expect(mocked).not.toHaveBeenCalled();
  });

  it("registra por invitación con el rol fijo del servidor aunque falte el pepper de pareja", async () => {
    const role = "11111111-1111-4111-8111-111111111111";
    vi.stubEnv("PLAYER_ROLE_ID", role);
    const mocked = vi.fn(async (url: string) => {
      if (url.includes("/users?")) return json([]);
      if (url.endsWith("/users")) return json({ id: "new-user" });
      if (url.endsWith("/users/invite")) return new Response(null, { status: 204 });
      throw new Error("unexpected endpoint");
    });
    vi.stubGlobal("fetch", mocked);
    await (await import("./account.js")).registerAccount({ email: " NEW@EXAMPLE.TEST ", first_name: "New", last_name: "User" });
    const create = mocked.mock.calls.find(([url]) => url.endsWith("/users"));
    const invite = mocked.mock.calls.find(([url]) => url.endsWith("/users/invite"));
    expect(JSON.parse(create?.[1]?.body as string)).toMatchObject({ email: "new@example.test", role, status: "invited" });
    expect(JSON.parse(invite?.[1]?.body as string)).toMatchObject({ email: "new@example.test", role, invite_url: "https://teanimas.com/?auth=accept-invite" });
  });

  it("no cambia el rol de alguien invitado para otra función", async () => {
    vi.stubEnv("PLAYER_ROLE_ID", "11111111-1111-4111-8111-111111111111");
    const mocked = vi.fn(async () => json([{ id: "invited-editor", status: "invited", role: "other-role" }]));
    vi.stubGlobal("fetch", mocked);
    await (await import("./account.js")).registerAccount({ email: "editor@example.test", first_name: "An", last_name: "Editor" });
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("no confirma invitación cuando Directus rechaza el envío", async () => {
    vi.stubEnv("PLAYER_ROLE_ID", "11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/users?")) return json([]);
      if (url.endsWith("/users")) return json({ id: "new-user" });
      return new Response(JSON.stringify({ errors: [{ message: "SMTP unavailable", extensions: { code: "SERVICE_UNAVAILABLE" } }] }), { status: 503 });
    }));
    await expect((await import("./account.js")).registerAccount({ email: "new@example.test", first_name: "New", last_name: "User" })).rejects.toMatchObject({ status: 503, endpoint: "/users/invite" });
  });
});

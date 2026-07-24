import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DIRECTUS_URL = "https://admin.example.com";
  process.env.DIRECTUS_TOKEN = "server-token";
  process.env.PLAYER_ROLE_ID = "11111111-1111-4111-8111-111111111111";
});

describe("cuentas y perfiles R19", () => {
  it("expone rutas privadas y valida Authorization", () => {
    const server = readFileSync("src/server.ts", "utf8");
    expect(server).toContain('requestUrl.pathname.startsWith("/v1/account/")');
    expect(server).toContain('requestUrl.pathname === "/v1/account/me"');
    expect(server).toContain('requestUrl.pathname === "/v1/account/profile"');
    expect(server).toContain("bearerToken(request)");
  });

  it("valida preferencias y rechaza campos desconocidos", async () => {
    const { SaveProfileSchema } = await import("../src/account.js");
    const valid = {
      preferences: {
        version: 1,
        playerOne: "Ale",
        playerTwo: "Pareja",
        playerOneSexSlug: null,
        playerTwoSexSlug: null,
        modeSlug: "pareja",
        levelSlugs: ["previa"],
        deckSlugs: ["clasico"],
        elementSlugs: [],
        toySlugs: [],
        filters: { excludePhotoVideo: true, maxPrivacyRisk: 1 },
        maxCards: 20,
        gameMasterEnabled: true,
      },
    };
    expect(SaveProfileSchema.parse(valid)).toEqual(valid);
    expect(() => SaveProfileSchema.parse({ ...valid, user: "otro-usuario" })).toThrow();
  });

  it("el servidor decide el propietario y usa token de usuario solo para autenticar", () => {
    const directus = readFileSync("src/directus.ts", "utf8");
    expect(directus).toContain("authenticateAccountToken");
    expect(directus).toContain("body: JSON.stringify({ user: userId, preferences })");
    expect(directus).not.toContain("body.user");
  });
});

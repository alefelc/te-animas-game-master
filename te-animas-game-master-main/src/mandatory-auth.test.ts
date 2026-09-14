import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

describe("autenticación obligatoria del Game Master 5.0.3", () => {
  it("rechaza solicitudes sin bearer antes de procesar el cuerpo o llamar a OpenAI", () => {
    const routeGuard = server.indexOf('requestUrl.pathname !== "/v1/game-master/next"');
    const tokenGuard = server.indexOf("const gameMasterToken = bearerToken(request)", routeGuard);
    const bodyRead = server.indexOf("rawRequestBody = await readBody(request)", tokenGuard);
    const openAiCall = server.indexOf("chooseValidDecision(", bodyRead);

    expect(tokenGuard).toBeGreaterThan(routeGuard);
    expect(bodyRead).toBeGreaterThan(tokenGuard);
    expect(openAiCall).toBeGreaterThan(bodyRead);
    expect(server.slice(tokenGuard, bodyRead)).toContain('code: "ACCOUNT_UNAUTHORIZED"');
  });

  it("valida una cuenta activa y limita por usuario antes de aceptar la decisión", () => {
    expect(server).toContain("await authenticateAccount(gameMasterToken)");
    expect(server).toContain("gameMasterAuthLimiter.allow");
    expect(server).toContain("gameMasterAccountLimiter.allow(`game-master:${gameMasterUserId}`)");
  });

  it("valida el usuario actual con su propio token y no con el token interno", () => {
    const account = readFileSync(new URL("./account.ts", import.meta.url), "utf8");
    const directus = readFileSync(new URL("./directus.ts", import.meta.url), "utf8");

    expect(account).toContain("await readCurrentAccountUser(accessToken)");
    expect(account).not.toContain("await readAccountUser(userId)");
    expect(directus).toContain('"/users/me?fields=id,email,first_name,last_name,status"');
  });

  it("no invalida un login correcto si el perfil opcional no está disponible", () => {
    const account = readFileSync(new URL("./account.ts", import.meta.url), "utf8");
    expect(account).toContain("![401, 403, 404].includes(error.status)");
  });
});

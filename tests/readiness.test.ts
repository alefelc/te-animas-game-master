import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("readiness v1.7.0", () => {
  it("expone una comprobación real de dependencias", () => {
    const server = readFileSync("src/server.ts", "utf8");
    const directus = readFileSync("src/directus.ts", "utf8");
    expect(server).toContain('requestUrl.pathname === "/ready"');
    expect(server).toContain("checkDirectusReady");
    expect(directus).toContain('"/users/me?fields=id"');
  });

  it("mantiene públicos solo los datos mínimos de salud", () => {
    const server = readFileSync("src/server.ts", "utf8");
    const healthStart = server.indexOf(
      'requestUrl.pathname === "/health"',
    );
    const aiHealthStart = server.indexOf(
      'requestUrl.pathname === "/health/ai"',
    );
    const publicHealth = server.slice(healthStart, aiHealthStart);

    expect(publicHealth).toContain('service: "te-animas-adaptive-api"');
    expect(publicHealth).not.toContain("lastAiAttempt");
    expect(publicHealth).not.toContain("allowedOrigins");
    expect(publicHealth).not.toContain("openaiModel");
    expect(
      server.slice(aiHealthStart, server.indexOf(
        'requestUrl.pathname === "/v1/account/register"',
      )),
    ).toContain("diagnosticAuthorized");
  });
});

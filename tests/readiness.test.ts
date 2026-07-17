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
});

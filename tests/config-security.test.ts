import { afterEach, describe, expect, it, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;
const originalPepper = process.env.COUPLE_INVITE_PEPPER;

afterEach(() => {
  vi.resetModules();
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalPepper === undefined) delete process.env.COUPLE_INVITE_PEPPER;
  else process.env.COUPLE_INVITE_PEPPER = originalPepper;
});

describe("production configuration", () => {
  it("fails closed when the couple invitation secret is missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.DIRECTUS_URL = "https://admin.example.com";
    process.env.DIRECTUS_TOKEN = "server-token";
    delete process.env.COUPLE_INVITE_PEPPER;
    vi.resetModules();

    await expect(import("../src/config.js")).rejects.toThrow(
      /COUPLE_INVITE_PEPPER/,
    );
  });

  it("accepts an independent secret with sufficient entropy", async () => {
    process.env.NODE_ENV = "production";
    process.env.DIRECTUS_URL = "https://admin.example.com";
    process.env.DIRECTUS_TOKEN = "server-token";
    process.env.COUPLE_INVITE_PEPPER =
      "test-only-independent-secret-with-32-chars";
    vi.resetModules();

    const { config } = await import("../src/config.js");
    expect(config.coupleInvitePepper).toBe(
      "test-only-independent-secret-with-32-chars",
    );
  });
});

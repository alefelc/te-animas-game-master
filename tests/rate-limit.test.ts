import { describe, expect, it, vi } from "vitest";
import { SlidingMinuteLimiter } from "../src/rate-limit.js";

describe("rate limiter", () => {
  it("aplica el límite por clave", () => {
    const limiter = new SlidingMinuteLimiter(2);
    expect(limiter.allow("client")).toBe(true);
    expect(limiter.allow("client")).toBe(true);
    expect(limiter.allow("client")).toBe(false);
  });

  it("mantiene acotada la memoria y recupera espacio al vencer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
    const limiter = new SlidingMinuteLimiter(1, 2);

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("c")).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.allow("c")).toBe(true);
    vi.useRealTimers();
  });
});

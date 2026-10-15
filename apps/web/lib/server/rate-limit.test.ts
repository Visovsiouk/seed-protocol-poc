import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSlidingWindowLimiter,
  RateLimitExceededError,
} from "./rate-limit";

describe("createSlidingWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows exactly `max` hits, then refuses", () => {
    const rl = createSlidingWindowLimiter({ max: 3 });
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
    expect(rl.allow("a")).toBe(false);
  });

  it("keys are independent", () => {
    const rl = createSlidingWindowLimiter({ max: 1 });
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
    expect(rl.allow("b")).toBe(true);
  });

  it("a refused hit is not recorded, so budget recovers exactly", () => {
    // Regression guard: if a refused call still appended a timestamp, a
    // caller who kept hammering would push their own window forward and stay
    // locked out well past the real expiry.
    const rl = createSlidingWindowLimiter({ max: 2, windowMs: 1000 });
    expect(rl.allow("a")).toBe(true); // t=0
    expect(rl.allow("a")).toBe(true); // t=0
    vi.advanceTimersByTime(500);
    expect(rl.allow("a")).toBe(false); // t=500, refused
    vi.advanceTimersByTime(501); // t=1001 — both real hits now expired
    expect(rl.allow("a")).toBe(true);
  });

  it("slides rather than resetting wholesale", () => {
    const rl = createSlidingWindowLimiter({ max: 2, windowMs: 1000 });
    rl.allow("a"); // t=0
    vi.advanceTimersByTime(600);
    rl.allow("a"); // t=600
    expect(rl.allow("a")).toBe(false);

    // t=1001: the t=0 hit has aged out, the t=600 hit has not -> one slot.
    vi.advanceTimersByTime(401);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
  });

  it("hit() throws instead of returning false", () => {
    const rl = createSlidingWindowLimiter({ max: 1 });
    expect(() => rl.hit("a")).not.toThrow();
    expect(() => rl.hit("a")).toThrow(RateLimitExceededError);
  });

  it("drops keys once their window fully expires", () => {
    const rl = createSlidingWindowLimiter({ max: 5, windowMs: 1000 });
    for (const k of ["a", "b", "c"]) rl.allow(k);
    expect(rl.size()).toBe(3);

    // Keys are only swept when the ceiling is reached, so size() still counts
    // expired entries until something forces a sweep. Drive one via maxKeys.
    vi.advanceTimersByTime(1001);
    const bounded = createSlidingWindowLimiter({
      max: 5,
      windowMs: 1000,
      maxKeys: 2,
    });
    for (const k of ["x", "y", "z"]) bounded.allow(k);
    vi.advanceTimersByTime(1001);
    bounded.allow("fresh");
    // x/y/z all aged out and were dropped; only "fresh" survives.
    expect(bounded.size()).toBe(1);
  });

  it("never exceeds maxKeys even with all-live keys", () => {
    const rl = createSlidingWindowLimiter({
      max: 10,
      windowMs: 60_000,
      maxKeys: 50,
    });
    for (let i = 0; i < 500; i++) rl.allow(`ip-${i}`);
    expect(rl.size()).toBeLessThanOrEqual(50);
  });

  it("evicts least-recently-used, preserving an active caller's budget", () => {
    const rl = createSlidingWindowLimiter({
      max: 2,
      windowMs: 60_000,
      maxKeys: 3,
    });
    rl.allow("active");
    rl.allow("active"); // "active" is now at its ceiling
    expect(rl.allow("active")).toBe(false);

    // Push three other keys through. "active" was touched most recently among
    // the originals, but these newcomers are newer still, so it is the LRU
    // once the ceiling bites.
    rl.allow("f1");
    rl.allow("f2");
    rl.allow("f3");
    expect(rl.size()).toBeLessThanOrEqual(3);

    // Re-touching "active" keeps it fresh across further churn.
    rl.allow("active");
    rl.allow("keep-churning");
    expect(rl.size()).toBeLessThanOrEqual(3);
  });

  it("reset() clears every bucket", () => {
    const rl = createSlidingWindowLimiter({ max: 1 });
    rl.allow("a");
    expect(rl.allow("a")).toBe(false);
    rl.reset();
    expect(rl.size()).toBe(0);
    expect(rl.allow("a")).toBe(true);
  });
});

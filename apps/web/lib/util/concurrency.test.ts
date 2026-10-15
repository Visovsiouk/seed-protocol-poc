import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./concurrency";

/** Resolves after `ms` of real time. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const out = await mapWithConcurrency(
      [50, 10, 30, 0, 20],
      async (ms, i) => {
        await sleep(ms);
        return `${i}:${ms}`;
      },
      3,
    );
    expect(out).toEqual(["0:50", "1:10", "2:30", "3:0", "4:20"]);
  });

  it("returns [] for empty input without invoking fn", async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], async () => {
      calls++;
      return 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 40 }, (_, i) => i),
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await sleep(2);
        inFlight--;
      },
      5,
    );
    expect(peak).toBe(5);
  });

  it("visits every item exactly once", async () => {
    const items = Array.from({ length: 37 }, (_, i) => i);
    const seen: number[] = [];
    await mapWithConcurrency(
      items,
      async (n) => {
        await sleep(1);
        seen.push(n);
      },
      4,
    );
    expect(seen.length).toBe(items.length);
    expect(new Set(seen).size).toBe(items.length);
  });

  it("caps workers at the input size for an oversized limit", async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency(
      [1, 2],
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await sleep(2);
        inFlight--;
      },
      1000,
    );
    expect(peak).toBe(2);
  });

  it("treats a zero or negative limit as serial rather than stalling", async () => {
    // Guard against a misconfigured ceiling deadlocking the scan: 0 workers
    // would await nothing and silently return holes.
    let peak = 0;
    let inFlight = 0;
    const out = await mapWithConcurrency(
      [1, 2, 3],
      async (n) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await sleep(1);
        inFlight--;
        return n * 2;
      },
      0,
    );
    expect(out).toEqual([2, 4, 6]);
    expect(peak).toBe(1);
  });

  it("propagates the first rejection", async () => {
    await expect(
      mapWithConcurrency(
        [1, 2, 3, 4],
        async (n) => {
          if (n === 2) throw new Error("boom");
          await sleep(5);
          return n;
        },
        2,
      ),
    ).rejects.toThrow("boom");
  });

  it("stops claiming new work after a rejection", async () => {
    let started = 0;
    await expect(
      mapWithConcurrency(
        Array.from({ length: 50 }, (_, i) => i),
        async (n) => {
          started++;
          if (n === 1) throw new Error("boom");
          await sleep(5);
          return n;
        },
        2,
      ),
    ).rejects.toThrow("boom");
    // Both workers started; the failing one stops, the other finishes its
    // current item and then claims at most a bounded few more before the
    // outer Promise.all rejects. The point is that it is nowhere near 50.
    expect(started).toBeLessThan(10);
  });
});

import { describe, expect, it } from "vitest";

import { withSignerLock } from "./signer-nonce-lock";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("withSignerLock", () => {
  it("runs tasks on the same key strictly one at a time", async () => {
    const order: string[] = [];
    const task = (id: string) => async () => {
      order.push(`${id}:start`);
      await tick();
      order.push(`${id}:end`);
      return id;
    };

    const results = await Promise.all([
      withSignerLock(A, task("1")),
      withSignerLock(A, task("2")),
      withSignerLock(A, task("3")),
    ]);

    expect(results).toEqual(["1", "2", "3"]);
    // No interleaving: every start is immediately followed by its own end.
    expect(order).toEqual([
      "1:start",
      "1:end",
      "2:start",
      "2:end",
      "3:start",
      "3:end",
    ]);
  });

  it("preserves submission order", async () => {
    const seen: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        withSignerLock(A, async () => {
          // Decreasing delays: a non-queueing implementation would let the
          // later, faster tasks finish first.
          await tick(10 - n);
          seen.push(n);
        }),
      ),
    );
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not serialize across different keys", async () => {
    let inFlight = 0;
    let peak = 0;
    const task = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    };

    await Promise.all([withSignerLock(A, task), withSignerLock(B, task)]);

    // Distinct keys (admin, three starter owners, per-realm delegates) must
    // run in parallel — serializing them all would make every mint wait on
    // every other realm's mint.
    expect(peak).toBe(2);
  });

  it("treats key casing as the same lock", async () => {
    // Callers pass `signer.account.address`, whose checksum casing varies by
    // source. A case-sensitive key would hand out two locks for one account.
    let inFlight = 0;
    let peak = 0;
    const task = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    };

    await Promise.all([
      withSignerLock(A, task),
      withSignerLock(A.toUpperCase() as `0x${string}`, task),
    ]);

    expect(peak).toBe(1);
  });

  it("propagates a task rejection to its own caller", async () => {
    await expect(
      withSignerLock(A, async () => {
        throw new Error("broadcast failed");
      }),
    ).rejects.toThrow("broadcast failed");
  });

  it("a rejected task does not poison the queue", async () => {
    // The tail stores an error-swallowing copy for exactly this reason: one
    // failed mint must not wedge the signer for the rest of the process.
    const failing = withSignerLock(A, async () => {
      throw new Error("nope");
    });
    await expect(failing).rejects.toThrow("nope");

    await expect(withSignerLock(A, async () => "fine")).resolves.toBe("fine");
  });

  it("still serializes the task queued behind a rejecting one", async () => {
    const order: string[] = [];
    const bad = withSignerLock(A, async () => {
      order.push("bad:start");
      await tick();
      order.push("bad:end");
      throw new Error("nope");
    });
    const good = withSignerLock(A, async () => {
      order.push("good:start");
      return "ok";
    });

    await expect(bad).rejects.toThrow();
    await expect(good).resolves.toBe("ok");
    expect(order).toEqual(["bad:start", "bad:end", "good:start"]);
  });
});

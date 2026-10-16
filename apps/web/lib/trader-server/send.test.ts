import { beforeEach, describe, expect, it, vi } from "vitest";

const TRADER = "0xcccccccccccccccccccccccccccccccccccccccc" as const;
const getTransactionCount = vi.fn();

// The trader client is the chain edge; the real `withSignerLock` underneath is
// what this file is actually exercising.
vi.mock("./client", () => ({
  loadTraderClient: () => ({
    account: { address: TRADER },
    publicClient: { getTransactionCount },
    wallet: {},
  }),
}));

const { sendTraderTx } = await import("./send");

describe("sendTraderTx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionCount.mockResolvedValue(7);
  });

  it("hands the pending nonce to the write callback", async () => {
    const write = vi.fn(async () => "0xhash" as const);

    const hash = await sendTraderTx(write);

    expect(getTransactionCount).toHaveBeenCalledWith({
      address: TRADER,
      blockTag: "pending",
    });
    expect(write).toHaveBeenCalledWith(7);
    expect(hash).toBe("0xhash");
  });

  it("serializes concurrent trader writes", async () => {
    // Every trader action signs from the one TRADER_PRIVATE_KEY and the rate
    // limit is per-IP, so two different players transacting at once is the
    // normal case. Without the lock both would read nonce 7 and the second
    // broadcast would revert "nonce too low".
    const order: string[] = [];
    getTransactionCount.mockImplementation(async () => {
      order.push("read");
      await new Promise((r) => setTimeout(r, 5));
      return 7;
    });
    const write = vi.fn(async () => {
      order.push("write");
      return "0xhash" as const;
    });

    await Promise.all([
      sendTraderTx(write),
      sendTraderTx(write),
      sendTraderTx(write),
    ]);

    expect(order).toEqual([
      "read",
      "write",
      "read",
      "write",
      "read",
      "write",
    ]);
  });

  it("observes a nonce advanced by the preceding write", async () => {
    // What serialization buys: each task sees the nonce the previous
    // broadcast consumed, rather than a stale shared read.
    let nonce = 7;
    getTransactionCount.mockImplementation(async () => nonce);
    const seen: number[] = [];
    const write = async (n: number) => {
      seen.push(n);
      nonce = n + 1; // broadcast lands, pending advances
      return "0xhash" as const;
    };

    await Promise.all([
      sendTraderTx(write),
      sendTraderTx(write),
      sendTraderTx(write),
    ]);

    expect(seen).toEqual([7, 8, 9]);
  });

  it("propagates a write failure to its caller", async () => {
    await expect(
      sendTraderTx(async () => {
        throw new Error("reverted");
      }),
    ).rejects.toThrow("reverted");
  });

  it("stays usable after a failed write", async () => {
    await expect(
      sendTraderTx(async () => {
        throw new Error("reverted");
      }),
    ).rejects.toThrow();

    await expect(sendTraderTx(async () => "0xnext" as const)).resolves.toBe(
      "0xnext",
    );
  });
});

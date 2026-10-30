import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/env parses publicSchema at module load. Set a high ceiling so the rate
// limit never interferes except in the case that tests it.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";
process.env.STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN = "1000";

import { epitaphFallback } from "@/lib/story/epitaph-bank";
import { EPITAPH_MAX_CHARS } from "@/lib/story/epitaph-wire";

/**
 * The invariant under test is one sentence long and it is the whole reason
 * this route is shaped the way it is:
 *
 *   **The game cannot tell whether a model answered.**
 *
 * Flag off, no key, model error, timeout, junk output — every one of them is
 * a 200 carrying the hand-authored bank note. Only a malformed body (400) and
 * the rate limit (429) are failures, because only those are the caller's
 * doing. The model boundary is mocked; everything else runs for real.
 */

const generateEpitaph = vi.fn();
vi.mock("@/lib/server/story-ai", () => ({
  generateEpitaph: (facts: unknown) => generateEpitaph(facts),
}));

const { POST } = await import("./route");
const { __resetEpitaphMemo } = await import("@/lib/server/epitaph-memo");
const { __resetStoryRateLimit } = await import("@/lib/server/story-guards");

const FACTS = {
  runSeed: `0x${"ab".repeat(32)}` as `0x${string}`,
  preset: "fantasy" as const,
  depth: 3,
  killedBy: "Forest Hag",
  wasBookmark: true,
  turns: 5,
  carried: 2,
};

function post(body: unknown, ip = "1.2.3.4"): Promise<Response> {
  return POST(
    new Request("http://localhost/api/story/epitaph", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  generateEpitaph.mockReset();
  __resetEpitaphMemo();
  __resetStoryRateLimit();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/story/epitaph", () => {
  it("answers 200 with the bank note when nothing is generated", async () => {
    generateEpitaph.mockResolvedValue(null);

    const res = await post(FACTS);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      text: epitaphFallback(FACTS).text,
      source: "bank",
    });
  });

  it("answers 200 with the bank note when the provider throws", async () => {
    // `generateEpitaph` promises never to throw; if that contract is ever
    // broken, the guard's catch-all must still not produce a 500 with no body.
    generateEpitaph.mockRejectedValue(new Error("upstream exploded"));

    const res = await post(FACTS);
    expect(res.status).toBe(500);
    // The one thing that must hold even then: a parseable JSON body.
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it("returns a generated note when one survives the filter", async () => {
    generateEpitaph.mockResolvedValue("Three rooms. It was faster than me.");

    const json = await (await post(FACTS)).json();
    expect(json.source).toBe("model");
    expect(json.text).toBe("Three rooms. It was faster than me.");
  });

  it("passes the parsed facts through to the provider", async () => {
    generateEpitaph.mockResolvedValue(null);
    await post(FACTS);
    expect(generateEpitaph).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "fantasy", depth: 3, turns: 5 }),
    );
  });

  it("calls the model at most once per death", async () => {
    generateEpitaph.mockResolvedValue("Three rooms. It was faster than me.");

    const a = await (await post(FACTS)).json();
    const b = await (await post(FACTS)).json();

    expect(generateEpitaph).toHaveBeenCalledTimes(1);
    expect(b.text).toBe(a.text);
  });

  it("treats a different death as a different note", async () => {
    generateEpitaph.mockResolvedValue("Three rooms. It was faster than me.");

    await post(FACTS);
    await post({ ...FACTS, depth: 4 });

    expect(generateEpitaph).toHaveBeenCalledTimes(2);
  });

  it("does not memoise a fallback", async () => {
    // A transient model failure must not poison the note for the rest of the
    // process — the next request for the same death should try again.
    generateEpitaph.mockResolvedValueOnce(null);
    generateEpitaph.mockResolvedValueOnce("Three rooms. It had me.");

    const first = await (await post(FACTS)).json();
    const second = await (await post(FACTS)).json();

    expect(first.source).toBe("bank");
    expect(second.source).toBe("model");
  });

  it.each([
    ["a non-JSON body", "not json at all"],
    ["an empty object", {}],
    ["a bad seed", { ...FACTS, runSeed: "0xabc" }],
    ["an unknown preset", { ...FACTS, preset: "western" }],
    ["a negative depth", { ...FACTS, depth: -2 }],
  ])("rejects %s with 400 and never calls the model", async (_l, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
    expect(generateEpitaph).not.toHaveBeenCalled();
  });

  it("rate-limits per IP with its own budget", async () => {
    process.env.STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN = "2";
    const { __resetStoryAiEnv } = await import("@/lib/env");
    __resetStoryAiEnv();
    __resetStoryRateLimit();
    generateEpitaph.mockResolvedValue(null);

    expect((await post(FACTS, "9.9.9.9")).status).toBe(200);
    expect((await post({ ...FACTS, depth: 4 }, "9.9.9.9")).status).toBe(200);
    expect((await post({ ...FACTS, depth: 5 }, "9.9.9.9")).status).toBe(429);
    // A different caller is unaffected — the budget is per IP.
    expect((await post(FACTS, "8.8.8.8")).status).toBe(200);

    process.env.STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN = "1000";
    __resetStoryAiEnv();
  });

  it.each([
    ["a mis-cased flag", "STORY_AI_ENABLED", "TRUE"],
    ["a non-numeric timeout", "STORY_AI_TIMEOUT_MS", "6s"],
    ["an unparseable rate limit", "STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN", "lots"],
  ])(
    "still answers 200 with the bank when the env has %s",
    async (_label, key, value) => {
      // The contract in this route's docblock is that narration can never
      // change a response code. `.default()` only fills in an *absent* value,
      // so a present-but-invalid one used to throw out of `withStoryGuards` —
      // which reads the rate limit before the handler runs — and every request
      // here became a 500 with no bank note in it.
      const before = process.env[key];
      process.env[key] = value;
      const { __resetStoryAiEnv } = await import("@/lib/env");
      __resetStoryAiEnv();
      __resetStoryRateLimit();
      generateEpitaph.mockResolvedValue(null);

      try {
        const res = await post(FACTS, "7.7.7.7");
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
          ok: true,
          source: "bank",
        });
      } finally {
        if (before === undefined) delete process.env[key];
        else process.env[key] = before;
        __resetStoryAiEnv();
        __resetStoryRateLimit();
      }
    },
  );

  it("never emits prose over the character cap", async () => {
    // The route trusts `generateEpitaph` to have sanitised, but the bank note
    // is composed here and must respect the same ceiling the overlay is laid
    // out for.
    generateEpitaph.mockResolvedValue(null);

    for (const preset of ["fantasy", "scifi", "cyberpunk"] as const) {
      for (const depth of [1, 3, 6]) {
        const json = await (
          await post({ ...FACTS, preset, depth, carried: depth })
        ).json();
        expect(json.text.length).toBeLessThanOrEqual(EPITAPH_MAX_CHARS);
      }
    }
  });
});

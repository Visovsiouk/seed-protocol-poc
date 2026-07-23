import { describe, expect, it } from "vitest";
import { deriveCodexStatus, type CodexInputs } from "./status";
import { CODEX_STEPS } from "./steps";

const NONE: CodexInputs = {
  hasAnyLoot: false,
  starterClears: 0,
  hasSeed: false,
  ownsRealm: false,
  realmMaxTier: null,
  hasListed: false,
  hasPurchased: false,
  hasSold: false,
  royaltyEarned: false,
  crossRealmCarry: false,
};

describe("deriveCodexStatus", () => {
  it("a fresh player has nothing stamped and the first step as next", () => {
    const s = deriveCodexStatus(NONE);
    expect(s.done.size).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.nextId).toBe(CODEX_STEPS[0].id);
  });

  it("the total excludes frontier steps", () => {
    const frontier = CODEX_STEPS.filter((st) => st.frontier).length;
    expect(deriveCodexStatus(NONE).total).toBe(CODEX_STEPS.length - frontier);
  });

  it("clears stamp progressively", () => {
    const s = deriveCodexStatus({ ...NONE, starterClears: 2, hasAnyLoot: true });
    expect(s.done.has("first-loot")).toBe(true);
    expect(s.done.has("first-clear")).toBe(true);
    expect(s.done.has("three-clears")).toBe(false);
  });

  it("the full solo journey stamps every non-frontier step", () => {
    const s = deriveCodexStatus({
      hasAnyLoot: true,
      starterClears: 3,
      hasSeed: true,
      ownsRealm: true,
      realmMaxTier: 3,
      hasListed: true,
      hasPurchased: true,
      hasSold: true,
      royaltyEarned: true,
      crossRealmCarry: true,
    });
    expect(s.completed).toBe(s.total);
    expect(s.nextId).toBe("tier"); // the frontier remains as the horizon
  });

  it("realm tier 4 stamps the frontier step", () => {
    const s = deriveCodexStatus({ ...NONE, ownsRealm: true, realmMaxTier: 4 });
    expect(s.done.has("tier")).toBe(true);
  });

  it("royalty requires the dedicated signal, not just a listing", () => {
    const s = deriveCodexStatus({ ...NONE, hasListed: true });
    expect(s.done.has("list")).toBe(true);
    expect(s.done.has("royalty")).toBe(false);
  });

  it("the split is witnessed from either side of a settlement", () => {
    // Buyer side: the player bought a relic.
    expect(
      deriveCodexStatus({ ...NONE, hasPurchased: true }).done.has("purchase"),
    ).toBe(true);
    // Seller side: the player's listing sold (e.g. to the hailed trader).
    expect(
      deriveCodexStatus({ ...NONE, hasSold: true }).done.has("purchase"),
    ).toBe(true);
    // A bare listing is not a settlement.
    expect(
      deriveCodexStatus({ ...NONE, hasListed: true }).done.has("purchase"),
    ).toBe(false);
  });
});

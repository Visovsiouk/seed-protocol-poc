import { describe, expect, it } from "vitest";

import type { Preset } from "@/lib/engine/types";
import {
  BOOKMARK_LINE_MAX_CHARS,
  BOOKMARK_LINE_MAX_SENTENCES,
  BOOKMARK_NAME_MAX_CHARS,
  PAGE_TEXT_MAX_CHARS,
  PAGE_TEXT_MAX_SENTENCES,
  realmPageFallback,
  type RealmLoreFacts,
} from "./page-bank";
import { countSentences } from "./prose-filter";
import { sanitizeBookmarkName, sanitizeRealmLore } from "./page-wire";

/**
 * The bank is what ships with the flag off, so these are not "nice to have"
 * properties — they are the shipped experience's spec. Two of them matter most:
 * the bank must be stable per realm forever, and it must satisfy the very
 * filter a *model's* answer has to pass, because a fallback that the filter
 * would reject is a fallback nobody has actually checked.
 */

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

/** A deterministic realm address from an integer, for sweeping the pools. */
function realmAt(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
}

function factsAt(n: number, over: Partial<RealmLoreFacts> = {}): RealmLoreFacts {
  return {
    realm: realmAt(n),
    name: "Pale Index",
    preset: "fantasy",
    bossId: "lich",
    ...over,
  };
}

describe("realmPageFallback", () => {
  it("is stable for a realm", () => {
    const a = realmPageFallback(factsAt(1));
    const b = realmPageFallback(factsAt(1));
    expect(b).toEqual(a);
  });

  it("reports itself as the bank", () => {
    expect(realmPageFallback(factsAt(1)).source).toBe("bank");
  });

  it("differs between realms", () => {
    // Not a distribution test — just the guarantee that the address is
    // actually load-bearing and two realms don't read identically.
    const seen = new Set<string>();
    for (let n = 1; n <= 40; n += 1) {
      seen.add(realmPageFallback(factsAt(n)).pageText);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it("does not depend on the name or the boss for its draw", () => {
    // Only the address seeds the RNG. If a rename ever reshuffled a realm's
    // lore, a creator editing their realm name would silently rewrite its
    // history — so the *shape* must be identical and only `{page}` differ.
    const a = realmPageFallback(factsAt(7, { name: "AAA", bossId: "lich" }));
    const b = realmPageFallback(factsAt(7, { name: "AAA", bossId: "dragon" }));
    expect(b).toEqual(a);
  });

  it("interpolates the realm's name and leaves no placeholder behind", () => {
    for (let n = 1; n <= 60; n += 1) {
      for (const preset of PRESETS) {
        const lore = realmPageFallback(factsAt(n, { name: "Pale Index", preset }));
        expect(lore.pageText).not.toMatch(/\{page\}|\{who\}/);
        expect(lore.bookmarkLine).not.toMatch(/\{page\}|\{who\}/);
      }
    }
  });

  it("names its bookmark in the line that describes it", () => {
    for (let n = 1; n <= 60; n += 1) {
      const lore = realmPageFallback(factsAt(n));
      expect(lore.bookmarkLine).toContain(lore.bookmarkName);
    }
  });

  it("respects every ceiling, including with a maximum-length realm name", () => {
    // 64 is the register route's `name` cap, so this is the real worst case.
    const name = "x".repeat(64);
    for (let n = 1; n <= 200; n += 1) {
      for (const preset of PRESETS) {
        const lore = realmPageFallback(factsAt(n, { name, preset }));
        expect(lore.pageText.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS);
        expect(countSentences(lore.pageText)).toBeLessThanOrEqual(
          PAGE_TEXT_MAX_SENTENCES,
        );
        expect(lore.bookmarkLine.length).toBeLessThanOrEqual(
          BOOKMARK_LINE_MAX_CHARS,
        );
        expect(countSentences(lore.bookmarkLine)).toBeLessThanOrEqual(
          BOOKMARK_LINE_MAX_SENTENCES,
        );
        expect(lore.bookmarkName.length).toBeLessThanOrEqual(
          BOOKMARK_NAME_MAX_CHARS,
        );
      }
    }
  });

  it("would survive the filter a model's answer has to pass", () => {
    // The point of this one: the bank and the model share `sanitizeRealmLore`,
    // so if the bank can't pass it, the filter is wrong about what good prose
    // looks like — or the bank is. Either way it's a bug, and it would only
    // ever show up on a machine that had a key.
    for (let n = 1; n <= 60; n += 1) {
      for (const preset of PRESETS) {
        const lore = realmPageFallback(factsAt(n, { preset }));
        expect(
          sanitizeRealmLore({
            name: lore.bookmarkName,
            page: lore.pageText,
            bookmark: lore.bookmarkLine,
          }),
        ).toEqual({
          pageText: lore.pageText,
          bookmarkName: lore.bookmarkName,
          bookmarkLine: lore.bookmarkLine,
        });
      }
    }
  });

  it("draws names the name gate accepts", () => {
    for (let n = 1; n <= 200; n += 1) {
      const { bookmarkName } = realmPageFallback(factsAt(n));
      expect(sanitizeBookmarkName(bookmarkName)).toBe(bookmarkName);
    }
  });

  it("does not mutate its input", () => {
    const facts = factsAt(3);
    const before = JSON.stringify(facts);
    realmPageFallback(facts);
    expect(JSON.stringify(facts)).toBe(before);
  });
});

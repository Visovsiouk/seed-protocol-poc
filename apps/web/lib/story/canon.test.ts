import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as canon from "./canon";
import * as coldOpen from "./coldOpen";
import * as marginalia from "./marginalia";
import * as bookmarks from "./bookmarks";
import * as progression from "./progression";
import * as provenance from "./provenance";
import * as epitaph from "./epitaph-bank";
import * as pageBank from "./page-bank";
import * as fantasy from "@/lib/flavor/fantasy";
import * as cyberpunk from "@/lib/flavor/cyberpunk";
import * as scifi from "@/lib/flavor/scifi";
import { BOOKMARKED, BORROWERS, CARD_ENTRIES, MARGIN_VOICES, PAGES, RETIRED_TERMS } from "./canon";

/**
 * Terminology guard.
 *
 * The rewrite retires nine abstractions (see `RETIRED_TERMS`). A migration
 * this wide across this many surfaces drifts unless something checks, and the
 * cheapest check is to walk every prose string a story module exports and
 * assert none of the retired vocabulary survives.
 *
 * `MODULES_UNDER_CANON` grows as each phase migrates a surface — a module
 * only joins the list once its copy has been rewritten, so the guard is
 * always green and always meaningful. Adding a module before migrating it
 * would just park a red test in the suite.
 */
/**
 * Modules whose prose sits in exported data, reachable by walking the
 * namespace. Modules that keep their prose behind a function go in
 * `PROSE_PROVIDERS` below instead.
 */
const MODULES_UNDER_CANON: Record<string, unknown> = {
  canon,
  coldOpen,
  marginalia,
  progression,
  // The flavor banks carry the ambient room/boss narration, which is where
  // the old vocabulary was thickest — ~30 hits across the three.
  fantasy,
  cyberpunk,
  scifi,
  // Deliberately absent: `lib/contracts/starter-realms.ts`. Its realm
  // taglines are prose and were migrated, but importing it pulls in
  // `lib/chain.ts` → `lib/env.ts`, which parses `publicSchema` eagerly at
  // module load and throws without NEXT_PUBLIC_* set. Stubbing chain env
  // inside a terminology test would couple this to deployment config for no
  // extra coverage, so the taglines are reviewed rather than asserted.
};

/**
 * Every boss the flavor banks ship, plus one id that is deliberately unknown
 * so `bookmarkLore`'s fallback prose gets scanned too.
 */
const ALL_BOSS_IDS = [
  "forest_hag", "black_ice", "ai_core",
  "lich", "dragon", "warden", "vampire",
  "ceo", "ghost", "rogue_god", "matron",
  "hive_queen", "void_prince", "reactor_wyrm", "oracle",
  "a_realm_that_does_not_exist",
];

/**
 * Modules that keep their prose in module-private consts behind a resolver.
 * Walking their namespace finds nothing, so the prose has to be *called* out
 * — which the anti-vacuous assertion below would otherwise (correctly) flag.
 */
const PROSE_PROVIDERS: Record<string, () => string[]> = {
  bookmarks: () =>
    ALL_BOSS_IDS.flatMap((id) => {
      const lore = bookmarks.bookmarkLore(id);
      return [lore.intro, lore.turn, lore.fell ?? ""];
    }),
  // A page's distinct-clearer count, said as a sentence. Exported as a
  // function, so the namespace walker can't see it — swept across every branch
  // (no clearers, one, several, and the T5 terminal case with no next rung).
  pageReach: () =>
    [
      { distinctClearers: 0, nextTierAt: 20 },
      { distinctClearers: 1, nextTierAt: 20 },
      { distinctClearers: 7, nextTierAt: 20 },
      { distinctClearers: 34, nextTierAt: 50 },
      { distinctClearers: 50, nextTierAt: null },
    ].map((args) => progression.pageReachLine(args)),
  // Every effect line plus both tier fallbacks. The effect names mirror the
  // catalog; an unknown one exercises the tier path.
  provenance: () => {
    const effects = [
      "lifesteal", "bleed", "crit_chance", "dodge_chance", "regen",
      "thorns", "armor_pierce", "multi_hit", "damage_reduction",
      "an_effect_with_no_line",
    ];
    const lines = effects.flatMap((name) =>
      [4, 5].map((tier) =>
        provenance.provenanceFor({ tier, catalogEffects: [{ name }] }),
      ),
    );
    // Tier-only fallbacks, with no effects at all.
    lines.push(
      provenance.provenanceFor({ tier: 4, catalogEffects: [] }),
      provenance.provenanceFor({ tier: 5, catalogEffects: [] }),
    );
    return lines.filter((l): l is string => l !== null);
  },
  // The note the book writes about the player, across every branch of the
  // composer (bookmark vs monster, carried vs empty-handed, each page).
  epitaph: () => {
    const seed =
      "0x4444444444444444444444444444444444444444444444444444444444444444" as const;
    const out: string[] = [];
    for (const preset of ["fantasy", "cyberpunk", "scifi"] as const) {
      for (const wasBookmark of [true, false]) {
        for (const carried of [0, 2]) {
          out.push(
            epitaph.epitaphFallback({
              runSeed: seed,
              preset,
              depth: 2,
              killedBy: "Something",
              wasBookmark,
              turns: 5,
              carried,
            }).text,
          );
        }
      }
    }
    return out;
  },
  // The lore of a page a player wrote. Swept across all three presets and
  // enough addresses to reach every pool entry — this is the one surface whose
  // prose a *model* may also produce, so the bank it falls back to has to be
  // the voice the reviewer checked.
  pageBank: () => {
    const out: string[] = [];
    for (let n = 1; n <= 60; n += 1) {
      for (const preset of ["fantasy", "cyberpunk", "scifi"] as const) {
        const lore = pageBank.realmPageFallback({
          realm: `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`,
          name: "Pale Index",
          preset,
          bossId: "lich",
        });
        out.push(lore.pageText, lore.bookmarkLine, lore.bookmarkName);
      }
    }
    return out;
  },
};

/**
 * Exports that legitimately *contain* retired vocabulary and must not be
 * scanned — `RETIRED_TERMS` is the denylist itself, so scanning it would fail
 * trivially and tell us nothing.
 */
const NOT_PROSE = new Set(["RETIRED_TERMS"]);

/** Every string reachable from a module's exports, minus the denylist. */
function proseStrings(mod: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();

  function walk(value: unknown, topLevelExport: string | null) {
    if (topLevelExport !== null && NOT_PROSE.has(topLevelExport)) return;
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    // Guard against a cycle (and against re-walking a shared constant).
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      walk(child, topLevelExport ?? key);
    }
  }

  walk(mod, null);
  return out;
}

describe("canon — terminology guard", () => {
  it("no story module under canon uses a retired term", () => {
    const sources: [string, string[]][] = [
      ...Object.entries(MODULES_UNDER_CANON).map(
        ([name, mod]) => [name, proseStrings(mod)] as [string, string[]],
      ),
      ...Object.entries(PROSE_PROVIDERS).map(
        ([name, get]) => [name, get().filter(Boolean)] as [string, string[]],
      ),
    ];

    for (const [name, strings] of sources) {
      // A module with no prose at all means the walker broke, not that the
      // module is clean — that would make this test silently vacuous.
      expect(strings.length, `${name} exported no strings to scan`).toBeGreaterThan(0);

      for (const term of RETIRED_TERMS) {
        const needle = term.toLowerCase();
        const offender = strings.find((s) => s.toLowerCase().includes(needle));
        expect(
          offender,
          `${name} still uses the retired term "${term}" in: ${offender}`,
        ).toBeUndefined();
      }
    }
  });

  /**
   * ── Why there is a second, source-level sweep ───────────────────────────
   * The walker above can only see strings reachable from a module's exports.
   * A great deal of this app's prose is written as JSX literals inside
   * components, which is structurally invisible to it — and that blind spot
   * shipped real regressions: `<Stamp>The makers'-roll</Stamp>` sat in
   * `GenesisLedger` for three commits even though "makers'-roll" is on the
   * denylist, and `RealmSelector` carried ~130 words of the pre-rewrite
   * register ("a maker who will carve a name", "the brand on your hand") on
   * the first screen after the cold open.
   *
   * So: read the component sources as text. Crude on purpose — it cannot tell
   * prose from an identifier — which is exactly why `RETIRED_TERMS` is kept
   * to phrases with no innocent homonym (asserted below). A term that would
   * trip on a variable name does not belong on the list in the first place.
   *
   * One consequence worth knowing before it surprises you: a *comment* cannot
   * quote a retired term either. Code explaining why some copy was replaced
   * has to describe the old wording rather than reproduce it, and point at
   * `RETIRED_TERMS` for the specifics. That is a fair price — the alternative
   * is a guard that only inspects string literals, which is precisely the
   * narrower check that let these regressions through.
   */
  // `process.cwd()` is `apps/web` under vitest (same assumption `realm-db.ts`
  // makes for the sqlite path), so this resolves without ESM `__dirname`.
  const COMPONENT_ROOT = resolve(process.cwd(), "components");

  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsxFiles(full));
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("no component source contains a retired term", () => {
    const files = tsxFiles(COMPONENT_ROOT);
    // Anti-vacuity: if the walk returns nothing the path is wrong, and the
    // test would pass by scanning an empty set.
    expect(files.length, "found no component sources to scan").toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const term of RETIRED_TERMS) {
        const needle = term.toLowerCase();
        if (text.includes(needle)) {
          offenders.push(
            `${relative(COMPONENT_ROOT, file)} uses the retired term "${term}"`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("retired terms are unambiguous phrases, not words with innocent uses", () => {
    // `warden` is a live community boss id and `work`/`mark`/`spark` have
    // ordinary uses, so banning them outright would make the guard unusable.
    // Documented in canon.ts; asserted here so nobody adds one casually.
    for (const term of RETIRED_TERMS) {
      expect(["warden", "wardens", "work", "mark", "spark", "sparks", "world"]).not.toContain(
        term.toLowerCase(),
      );
    }
  });
});

describe("canon — borrowers", () => {
  it("every borrower's id matches its key, so lookups can't silently miss", () => {
    for (const [key, b] of Object.entries(BORROWERS)) {
      expect(b.id).toBe(key);
    }
  });

  it("names and signatures are present and distinct", () => {
    const names = Object.values(BORROWERS).map((b) => b.name);
    const signatures = Object.values(BORROWERS).map((b) => b.signature);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(signatures).size).toBe(signatures.length);
    for (const b of Object.values(BORROWERS)) {
      expect(b.name).toMatch(/.+/);
      expect(b.signature).toMatch(/.+/);
    }
  });

  it("the margin voices wrote, and the bookmarked were bound", () => {
    for (const id of MARGIN_VOICES) expect(BORROWERS[id].fate).toBe("margins");
    for (const id of BOOKMARKED) expect(BORROWERS[id].fate).toBe("bookmarked");
    expect(MARGIN_VOICES).toHaveLength(3);
    expect(BOOKMARKED).toHaveLength(3);
  });

  it("a margin voice can read the bookmark on their own page", () => {
    // The plot rests on this: each voice arrives after the borrower bound in
    // their page, so their notes can be *about* that binding. If a year ever
    // drifts the wrong way, the marginalia stops making sense.
    for (const p of Object.values(PAGES)) {
      const voice = BORROWERS[p.margins];
      const bound = BORROWERS[p.bookmark];
      expect(
        voice.year,
        `${voice.name} (${voice.year}) must arrive after ${bound.name} (${bound.year}) was bound`,
      ).toBeGreaterThan(bound.year);
    }
  });

  it("the card's stamped entries are deliberately out of chronological order", () => {
    // The scramble is the second thing wrong with the card and the opening
    // beat depends on the player noticing it.
    const years = CARD_ENTRIES.map((id) => BORROWERS[id].year);
    const sorted = [...years].sort((a, b) => a - b);
    expect(years).not.toEqual(sorted);
  });

  it("the Colophon's entry is absent from the card — he scratched it out", () => {
    // He is the only borrower with no provenance; that's his whole weakness.
    for (const id of CARD_ENTRIES) {
      expect(BORROWERS[id].year).toBeGreaterThan(canon.COLOPHON.FIRST_YEAR);
    }
  });

  it("every borrower carries a full borrow date that agrees with its year", () => {
    // `borrowed` is what the card stamps and `year` is what the prose says
    // ("filed 1847"). Two fields for one fact, so they get pinned together.
    for (const b of Object.values(BORROWERS)) {
      expect(b.borrowed, `${b.name} has no borrow date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number(b.borrowed.slice(0, 4)), `${b.name}: year vs borrowed`).toBe(b.year);
    }
    expect(canon.COLOPHON.FIRST_BORROWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(canon.COLOPHON.FIRST_BORROWED.slice(0, 4))).toBe(
      canon.COLOPHON.FIRST_YEAR,
    );
  });

  it("stamps every date in one format, because it is one stamp", () => {
    expect(canon.stampDate("1911-02-27")).toBe("27 FEB 1911");
    expect(canon.stampDate("1788-04-09")).toBe("09 APR 1788");
    expect(canon.stampDate("2041-01-22")).toBe("22 JAN 2041");
    expect(canon.stampDate("2026-10-23")).toBe("23 OCT 2026");
    // Degrades to the input rather than throwing or printing "Invalid Date".
    expect(canon.stampDate("tonight")).toBe("tonight");
  });
});

describe("canon — the Colophon", () => {
  it("writes one word and nothing else", () => {
    // `fin.` is the word printed at the end of a finished work. Written under
    // a borrower who has only just signed in, it is a verdict rather than a
    // signature — and it is the claim the whole game argues against. It had a
    // decorative bracket beside it once; a bare glyph meant nothing to anyone
    // and diluted the one mark that explains itself.
    expect(canon.COLOPHON.SIGN).toBe("fin.");
    expect(canon.COLOPHON).not.toHaveProperty("MARK");
  });

  it("has no name to render — that is the point of him", () => {
    expect(canon.COLOPHON).not.toHaveProperty("name");
    expect(Object.values(BORROWERS).map((b) => b.name)).not.toContain(
      canon.COLOPHON.TITLE,
    );
  });
});

describe("canon — pages", () => {
  it("covers all three presets with distinct bosses and bookmarks", () => {
    const presets = Object.keys(PAGES);
    expect(presets.sort()).toEqual(["cyberpunk", "fantasy", "scifi"]);

    const bossIds = Object.values(PAGES).map((p) => p.bossId);
    const bookmarks = Object.values(PAGES).map((p) => p.bookmark);
    expect(new Set(bossIds).size).toBe(3);
    expect(new Set(bookmarks).size).toBe(3);
  });

  it("keeps the shipped boss ids — the id gains a person, it doesn't change", () => {
    // These are wired into the flavor banks, the art families map and the
    // seeded realms. The rewrite re-points their meaning, never their key.
    expect(PAGES.fantasy.bossId).toBe("forest_hag");
    expect(PAGES.cyberpunk.bossId).toBe("black_ice");
    expect(PAGES.scifi.bossId).toBe("ai_core");
  });

  it("keeps the shipped page names", () => {
    expect(PAGES.fantasy.name).toBe("The Hollow Reach");
    expect(PAGES.cyberpunk.name).toBe("Black Ice District");
    expect(PAGES.scifi.name).toBe("Drift Station Ker-7");
  });

  it("the third page is named for the borrower bound in it", () => {
    // Ker wrote that page and signed it with his own name; the station
    // bearing it is the evidence the player can read off the realm list.
    expect(PAGES.scifi.name).toContain("Ker");
    expect(BORROWERS[PAGES.scifi.bookmark].name).toContain("Ker");
  });

  it("revision runs unreached → underway → finished in play order", () => {
    // The Colophon works from the back of the book forward, so the order the
    // game already enforces walks the player toward his completed work.
    expect(PAGES.fantasy.revision).toBe("unreached");
    expect(PAGES.cyberpunk.revision).toBe("underway");
    expect(PAGES.scifi.revision).toBe("finished");
  });

  it("resolves a bookmark from a boss id, and declines unknown bosses", () => {
    expect(canon.bookmarkFor("forest_hag")?.name).toBe("Hesper Alder");
    expect(canon.bookmarkFor("ai_core")?.name).toBe("Aurelio Ker");
    // Community bosses have no canon bookmark; callers fall back.
    expect(canon.bookmarkFor("lich")).toBeNull();
  });
});

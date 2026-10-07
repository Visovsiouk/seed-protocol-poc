import { describe, expect, it, vi } from "vitest";
import type { BossDef, MonsterDef, Preset } from "@/lib/engine/types";
import { getFlavorBank } from "@/lib/flavor";
import { __clearCreatureCache, creatureSpec, type CreatureSpecInput } from "./creature";
import { FAMILIES, familyFor } from "./families";
import { FIELD } from "./seed";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

function input(over: Partial<CreatureSpecInput> = {}): CreatureSpecInput {
  return {
    preset: "fantasy",
    id: "goblin",
    family: "humanoid",
    hp: 8,
    attackDie: 4,
    ac: 11,
    element: null,
    weakTo: null,
    resistTo: null,
    isBoss: false,
    variant: "base",
    ...over,
  };
}

type Spec = ReturnType<typeof creatureSpec>;

/** Every drawn coordinate, for field-bounds checking. The aura is excluded —
 *  it is a soft glow, deliberately allowed to bleed past the silhouette. */
function coords(spec: Spec): number[] {
  const out: number[] = [];
  for (const s of [
    ...spec.body,
    ...spec.crown,
    ...spec.plates,
    ...spec.eyes,
    ...spec.marks,
  ]) {
    if (s.kind === "circle") out.push(s.cx - s.r, s.cx + s.r, s.cy - s.r, s.cy + s.r);
    else for (const n of s.d.match(/-?\d+(\.\d+)?/g) ?? []) out.push(Number(n));
  }
  return out;
}

function nodeCount(spec: Spec): number {
  return (
    spec.body.length + spec.crown.length + spec.plates.length +
    spec.eyes.length + spec.marks.length
  );
}

/** Every roster entry across all three banks, as generator input. */
function roster(): CreatureSpecInput[] {
  const out: CreatureSpecInput[] = [];
  for (const preset of PRESETS) {
    const bank = getFlavorBank(preset);
    for (const m of Object.values(bank.monsters) as MonsterDef[]) {
      out.push(
        input({
          preset, id: m.id, family: familyFor(preset, m.id),
          hp: m.hp, attackDie: m.attackDie, ac: m.ac,
          element: m.element, weakTo: m.weakTo, resistTo: m.resistTo,
          isBoss: false, variant: "base",
        }),
      );
    }
    for (const b of Object.values(bank.bosses) as BossDef[]) {
      for (const variant of ["base", "turned"] as const) {
        out.push(
          input({
            preset, id: b.id, family: familyFor(preset, b.id),
            hp: b.baseHp,
            attackDie: variant === "turned" ? b.phase2AttackDie : b.attackDie,
            ac: b.ac, element: b.element, weakTo: b.weakTo, resistTo: b.resistTo,
            isBoss: true, variant,
          }),
        );
      }
    }
  }
  return out;
}

describe("creatureSpec", () => {
  it("is deterministic across a cold cache", () => {
    __clearCreatureCache();
    const a = JSON.stringify(creatureSpec(input()));
    __clearCreatureCache();
    const b = JSON.stringify(creatureSpec(input()));
    expect(a).toBe(b);
  });

  it("is stable per species — every Goblin is the same Goblin", () => {
    // The whole point of keying on species rather than encounter. If live
    // state ever leaks into the generator input this is what catches it.
    const first = JSON.stringify(creatureSpec(input()));
    for (let n = 0; n < 50; n++) {
      expect(JSON.stringify(creatureSpec(input()))).toBe(first);
    }
  });

  it("draws different species differently", () => {
    const drawn = ["goblin", "wolf", "skeleton", "wraith"].map((id) =>
      JSON.stringify(creatureSpec(input({ id, family: familyFor("fantasy", id) }))),
    );
    expect(new Set(drawn).size).toBe(4);
  });

  it("gives every family a non-empty body and a face", () => {
    for (const family of FAMILIES) {
      const spec = creatureSpec(input({ family, id: `probe_${family}` }));
      expect(spec.body.length).toBeGreaterThan(0);
      expect(spec.eyes.length).toBeGreaterThan(0);
      expect(spec.family).toBe(family);
    }
  });

  it("renders the entire roster without a hole", () => {
    for (const i of roster()) {
      const spec = creatureSpec(i);
      expect(spec.body.length).toBeGreaterThan(0);
      expect(spec.crown.length).toBeGreaterThan(0);
      expect(spec.plates.length).toBeGreaterThan(0);
    }
  });

  it("keeps the whole roster inside the field", () => {
    // A coordinate outside 0..100 clips out of the viewBox and the creature
    // silently loses a limb — the exact bug the crown cap in buildCrown fixes.
    for (const i of roster()) {
      for (const n of coords(creatureSpec(i))) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(FIELD);
      }
    }
  });

  it("keeps extreme stats in the field too", () => {
    // Player-deployed realms are not bound by the starter rosters' stat bands.
    for (const family of FAMILIES) {
      for (const hp of [1, 6, 48, 800]) {
        for (const attackDie of [4, 12]) {
          for (const ac of [1, 11, 16, 40]) {
            const spec = creatureSpec(
              input({ family, hp, attackDie, ac, isBoss: true, variant: "turned", id: `x${hp}${ac}` }),
            );
            for (const n of coords(spec)) {
              expect(n).toBeGreaterThanOrEqual(0);
              expect(n).toBeLessThanOrEqual(FIELD);
            }
          }
        }
      }
    }
  });

  it("stays within the node budget", () => {
    // Framer wrappers aside, a bloated sigil costs on the hot combat path.
    for (const i of roster()) {
      expect(nodeCount(creatureSpec(i))).toBeLessThanOrEqual(24);
    }
  });

  it("scales the crown with the attack die", () => {
    const small = creatureSpec(input({ attackDie: 4, id: "d4" })).crown.length;
    const big = creatureSpec(input({ attackDie: 12, id: "d12" })).crown.length;
    expect(big).toBeGreaterThan(small);
  });

  it("scales plating with AC", () => {
    const thin = creatureSpec(input({ ac: 11, id: "ac11" })).plates.length;
    const thick = creatureSpec(input({ ac: 16, id: "ac16" })).plates.length;
    expect(thick).toBeGreaterThan(thin);
  });

  it("only gives elemental foes an aura", () => {
    expect(creatureSpec(input({ element: "fire" })).aura).not.toBeNull();
    expect(creatureSpec(input({ element: "none" })).aura).toBeNull();
    expect(creatureSpec(input({ element: null })).aura).toBeNull();
  });

  it("marks weakness and resistance independently", () => {
    expect(creatureSpec(input({ id: "m0" })).marks).toHaveLength(0);
    expect(creatureSpec(input({ id: "m1", weakTo: "fire" })).marks).toHaveLength(1);
    expect(
      creatureSpec(input({ id: "m2", weakTo: "holy", resistTo: "unholy" })).marks,
    ).toHaveLength(2);
  });

  it("visibly changes form when a warden turns", () => {
    const base = creatureSpec(input({ id: "lich", isBoss: true, attackDie: 6, variant: "base" }));
    const turned = creatureSpec(input({ id: "lich", isBoss: true, attackDie: 8, variant: "turned" }));
    expect(JSON.stringify(base)).not.toBe(JSON.stringify(turned));
    expect(turned.crown.length).toBeGreaterThan(base.crown.length);
  });

  it("carries no colour — specs are geometry only", () => {
    const json = JSON.stringify(creatureSpec(input({ element: "fire", weakTo: "ice" })));
    expect(json).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(json).not.toMatch(/var\(|color-mix\(/);
  });

  it("emits only parseable path data", () => {
    for (const i of roster()) {
      const spec = creatureSpec(i);
      for (const s of [...spec.body, ...spec.crown, ...spec.plates, ...spec.marks]) {
        if (s.kind === "path") expect(s.d).toMatch(/^[MLCQAZHVmlcqazhv0-9 .,-]+$/);
      }
    }
  });

  it("is SSR-safe", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("nondeterminism on the render path");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("nondeterminism on the render path");
    });
    try {
      __clearCreatureCache();
      expect(() => roster().forEach(creatureSpec)).not.toThrow();
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });
});

/**
 * Creature sigil generator.
 *
 * Builds a bilaterally-symmetric silhouette for an enemy from its silhouette
 * family and its combat stats. Symmetry is what makes the output read as a
 * creature rather than noise: every feature is generated on the right half and
 * mirrored across `MID`, so even a heavily-jittered sigil has a face.
 *
 * Trait mapping:
 *   family      → base topology (humanoid / beast / undead / wisp / …)
 *   hp          → body mass
 *   attackDie   → crown count (horns, spikes, limbs, wings)
 *   ac          → plating arcs
 *   element     → hue and aura, resolved at render time
 *   weakTo      → a fracture mark;  resistTo → a shield arc
 *   hash(id)    → asymmetric detail and vertex jitter
 *
 * Live combat state never reaches this function. Current HP and boss phase
 * drive *animation* on the component; the only form-level input is `variant`,
 * which the caller sets to `"turned"` for a boss past its phase break and
 * pairs with the phase-2 attack die. That keeps the generator a function of
 * traits, with the caller choosing which traits apply.
 */

import type { Shape } from "./archetypes";
import type { Family } from "./families";
import { MID, memoize, artRng, lerp, norm, polar, r2 } from "./seed";
import type { Rng } from "@/lib/engine/rng";

export type CreatureSpec = {
  readonly family: Family;
  /** Main silhouette mass. */
  readonly body: readonly Shape[];
  /** Horns / spikes / limbs / wings — scales with attack die. */
  readonly crown: readonly Shape[];
  /** Plating arcs — scales with AC. */
  readonly plates: readonly Shape[];
  /** Mirrored eye pair. */
  readonly eyes: readonly Shape[];
  /** Vulnerability fracture and/or resistance arc. */
  readonly marks: readonly Shape[];
  /** Soft glow behind the silhouette, for elemental foes. */
  readonly aura: { cx: number; cy: number; r: number } | null;
};

export type CreatureSpecInput = {
  readonly preset: string;
  readonly id: string;
  readonly family: Family;
  readonly hp: number;
  readonly attackDie: number;
  readonly ac: number;
  readonly element?: string | null;
  readonly weakTo?: string | null;
  readonly resistTo?: string | null;
  readonly isBoss: boolean;
  /** `"turned"` once a warden passes its phase break. */
  readonly variant: "base" | "turned";
};

const cache = new Map<string, CreatureSpec>();

function cacheKey(i: CreatureSpecInput): string {
  return [
    i.preset, i.id, i.family, i.hp, i.attackDie, i.ac,
    i.element ?? "none", i.weakTo ?? "none", i.resistTo ?? "none",
    i.isBoss ? "boss" : "mob", i.variant,
  ].join("|");
}

export function creatureSpec(input: CreatureSpecInput): CreatureSpec {
  return memoize(cache, cacheKey(input), () => build(input));
}

/** Per-family proportions. Tuned so each class reads at a glance. */
const SHAPE: Record<
  Family,
  { bodyW: number; bodyH: number; cy: number; headR: number; headY: number }
> = {
  humanoid: { bodyW: 24, bodyH: 30, cy: 60, headR: 10, headY: 28 },
  beast:    { bodyW: 36, bodyH: 22, cy: 62, headR: 11, headY: 38 },
  undead:   { bodyW: 19, bodyH: 28, cy: 60, headR: 12, headY: 28 },
  wisp:     { bodyW: 22, bodyH: 26, cy: 54, headR: 9,  headY: 34 },
  winged:   { bodyW: 18, bodyH: 26, cy: 58, headR: 9,  headY: 30 },
  hulk:     { bodyW: 42, bodyH: 32, cy: 58, headR: 9,  headY: 26 },
  swarm:    { bodyW: 30, bodyH: 26, cy: 56, headR: 7,  headY: 32 },
};

/** Mirror a right-half x coordinate to the left. */
function mirror(x: number): number {
  return r2(2 * MID - x);
}

/** Emit a shape and its mirror image. */
function pair(right: Shape, left: Shape): Shape[] {
  return [right, left];
}

function mirroredCircle(cx: number, cy: number, r: number, filled = false): Shape[] {
  return pair(
    { kind: "circle", cx: r2(cx), cy: r2(cy), r: r2(r), filled },
    { kind: "circle", cx: mirror(cx), cy: r2(cy), r: r2(r), filled },
  );
}

function mirroredLine(
  x1: number, y1: number, x2: number, y2: number, weight: number,
): Shape[] {
  return pair(
    { kind: "path", d: `M${r2(x1)} ${r2(y1)} L${r2(x2)} ${r2(y2)}`, weight },
    { kind: "path", d: `M${mirror(x1)} ${r2(y1)} L${mirror(x2)} ${r2(y2)}`, weight },
  );
}

function build(i: CreatureSpecInput): CreatureSpec {
  const rng = artRng(`creature:${i.preset}:${i.id}:${i.variant}`);
  const g = SHAPE[i.family];

  // Mass grows with HP but saturates, so a player realm's 800-HP boss is
  // chunky rather than field-bursting.
  const mass = norm(i.hp, 6, 48);
  const halfW = lerp(g.bodyW * 0.72, g.bodyW, mass) / 2;
  const halfH = lerp(g.bodyH * 0.75, g.bodyH, mass) / 2;
  const headR = lerp(g.headR * 0.85, g.headR * 1.15, mass);

  const body = buildBody(i.family, g, halfW, halfH, headR, rng);
  const crown = buildCrown(i, g, halfW, headR, rng);
  const plates = buildPlates(i, g, halfW, halfH);
  const eyes = buildEyes(i.family, g, headR);
  const marks = buildMarks(i, g, halfW);

  const hasElement = !!i.element && i.element !== "none";
  const aura = hasElement
    ? { cx: MID, cy: r2(g.cy - 6), r: r2(lerp(26, 38, mass)) }
    : null;

  return { family: i.family, body, crown, plates, eyes, marks, aura };
}

function buildBody(
  family: Family,
  g: (typeof SHAPE)[Family],
  halfW: number,
  halfH: number,
  headR: number,
  rng: Rng,
): Shape[] {
  const out: Shape[] = [];
  const top = g.cy - halfH;
  const bot = g.cy + halfH;

  if (family === "wisp") {
    // No solid mass — concentric arcs around a core, trailing into nothing.
    out.push({ kind: "circle", cx: MID, cy: r2(g.cy - 4), r: r2(halfW * 0.5), filled: true });
    for (let k = 0; k < 3; k++) {
      const r = halfW * (0.9 + k * 0.45);
      out.push({
        kind: "path",
        d: `M${r2(MID - r)} ${r2(g.cy - 4)} Q${MID} ${r2(g.cy - 4 - r * 1.1)} ${r2(MID + r)} ${r2(g.cy - 4)}`,
        weight: 2,
      });
    }
    out.push({
      kind: "path",
      d: `M${r2(MID - halfW * 0.4)} ${r2(bot - 2)} Q${MID} ${r2(bot + 10)} ${r2(MID + halfW * 0.4)} ${r2(bot - 2)}`,
      weight: 2,
    });
    return out;
  }

  if (family === "swarm") {
    // A cloud of bodies rather than one. Positions are mirrored pairs so the
    // cluster still has an axis.
    const n = 4;
    for (let k = 0; k < n; k++) {
      const dx = lerp(halfW * 0.25, halfW, rng.next());
      const dy = lerp(top + 4, bot - 4, rng.next());
      const r = lerp(3.5, 6.5, rng.next());
      out.push(...mirroredCircle(MID + dx, dy, r, k % 2 === 0));
    }
    out.push({ kind: "circle", cx: MID, cy: r2(g.cy), r: r2(halfW * 0.34), filled: true });
    return out;
  }

  // Head.
  out.push({ kind: "circle", cx: MID, cy: r2(g.headY), r: r2(headR), filled: family !== "undead" });

  // Torso.
  if (family === "beast") {
    // Low, long back with a dropped head line.
    out.push({
      kind: "path",
      d: `M${r2(MID - halfW)} ${r2(bot)} Q${r2(MID - halfW * 0.6)} ${r2(top)} ${MID} ${r2(top + 2)} Q${r2(MID + halfW * 0.6)} ${r2(top)} ${r2(MID + halfW)} ${r2(bot)} Z`,
      filled: true,
    });
    // Four legs.
    out.push(...mirroredLine(MID + halfW * 0.75, bot - 2, MID + halfW * 0.85, bot + 12, 3));
    out.push(...mirroredLine(MID + halfW * 0.28, bot - 1, MID + halfW * 0.3, bot + 12, 3));
    return out;
  }

  if (family === "hulk") {
    // Wide slab shoulders tapering to a narrow base.
    out.push({
      kind: "path",
      d: `M${r2(MID - halfW)} ${r2(top)} L${r2(MID + halfW)} ${r2(top)} L${r2(MID + halfW * 0.55)} ${r2(bot)} L${r2(MID - halfW * 0.55)} ${r2(bot)} Z`,
      filled: true,
    });
    out.push(...mirroredLine(MID + halfW * 0.4, bot, MID + halfW * 0.5, bot + 10, 5));
    return out;
  }

  if (family === "undead") {
    // Open ribcage rather than a solid torso.
    out.push({
      kind: "path",
      d: `M${r2(MID - halfW)} ${r2(top)} L${r2(MID + halfW)} ${r2(top)} L${r2(MID + halfW * 0.7)} ${r2(bot)} L${r2(MID - halfW * 0.7)} ${r2(bot)} Z`,
      weight: 2,
    });
    for (let k = 0; k < 3; k++) {
      const y = lerp(top + 5, bot - 4, k / 2);
      out.push({
        kind: "path",
        d: `M${r2(MID - halfW * 0.8)} ${r2(y)} L${r2(MID + halfW * 0.8)} ${r2(y)}`,
        weight: 2,
      });
    }
    return out;
  }

  // humanoid / winged — upright torso with shoulders and legs.
  out.push({
    kind: "path",
    d: `M${r2(MID - halfW)} ${r2(top + 4)} Q${MID} ${r2(top - 3)} ${r2(MID + halfW)} ${r2(top + 4)} L${r2(MID + halfW * 0.62)} ${r2(bot)} L${r2(MID - halfW * 0.62)} ${r2(bot)} Z`,
    filled: true,
  });
  out.push(...mirroredLine(MID + halfW * 0.4, bot, MID + halfW * 0.5, bot + 11, 3));
  return out;
}

function buildCrown(
  i: CreatureSpecInput,
  g: (typeof SHAPE)[Family],
  halfW: number,
  headR: number,
  rng: Rng,
): Shape[] {
  const out: Shape[] = [];
  // d4 → 1 pair, d12 → 4 pairs. A turned warden gains one more.
  const steps = Math.round(norm(i.attackDie, 4, 12) * 3) + 1;
  const count = Math.min(5, steps + (i.variant === "turned" ? 1 : 0));

  if (i.family === "winged") {
    // Wings instead of spikes; the count sets how many feather ribs.
    const span = halfW + 22;
    out.push(
      ...pair(
        {
          kind: "path",
          d: `M${r2(MID + halfW * 0.5)} ${r2(g.cy - 12)} Q${r2(MID + span)} ${r2(g.cy - 30)} ${r2(MID + span - 3)} ${r2(g.cy + 6)} Q${r2(MID + halfW)} ${r2(g.cy - 2)} ${r2(MID + halfW * 0.5)} ${r2(g.cy - 12)} Z`,
          weight: 2,
        },
        {
          kind: "path",
          d: `M${mirror(MID + halfW * 0.5)} ${r2(g.cy - 12)} Q${mirror(MID + span)} ${r2(g.cy - 30)} ${mirror(MID + span - 3)} ${r2(g.cy + 6)} Q${mirror(MID + halfW)} ${r2(g.cy - 2)} ${mirror(MID + halfW * 0.5)} ${r2(g.cy - 12)} Z`,
          weight: 2,
        },
      ),
    );
    for (let k = 0; k < count; k++) {
      const t = (k + 1) / (count + 1);
      out.push(
        ...mirroredLine(
          MID + halfW * 0.6,
          g.cy - 10,
          MID + lerp(halfW * 0.9, span - 5, t),
          g.cy - 18 + t * 22,
          1.5,
        ),
      );
    }
    return out;
  }

  // Horns / spikes fanning off the crown of the head.
  //
  // The tip radius is capped so a horn can never breach the top of the field:
  // at the smallest spread angle the tip sits at `headY - tipR`, so without
  // this a big-headed boss with a long roll clips out of the viewBox and
  // silently loses its crown. The floor keeps a stub visible when the cap
  // bites hard (undead carry the largest heads).
  const baseR = headR * 0.9;
  const tipCap = Math.max(baseR + 4, g.headY - 5);

  for (let k = 0; k < count; k++) {
    const angle = count === 1 ? 0.35 : lerp(0.18, 0.95, k / (count - 1));
    const len = lerp(9, 17, rng.next()) * (i.isBoss ? 1.25 : 1);
    const tipR = Math.min(baseR + len, tipCap);
    const [bx, by] = polar(MID, g.headY, baseR, angle);
    const [tx, ty] = polar(MID, g.headY, tipR, angle);
    out.push(...mirroredLine(bx, by, tx, ty, i.isBoss ? 3 : 2));
  }
  return out;
}

function buildPlates(
  i: CreatureSpecInput,
  g: (typeof SHAPE)[Family],
  halfW: number,
  halfH: number,
): Shape[] {
  // AC 11 → 1 arc, AC 15+ → 3. Bosses read one heavier.
  const count = Math.min(
    3,
    Math.round(norm(i.ac, 11, 16) * 2) + 1 + (i.isBoss ? 1 : 0),
  );
  const out: Shape[] = [];
  for (let k = 0; k < count; k++) {
    const y = g.cy - halfH * 0.4 + k * (halfH / 1.6);
    const w = halfW * (0.82 - k * 0.12);
    out.push({
      kind: "path",
      d: `M${r2(MID - w)} ${r2(y)} Q${MID} ${r2(y + 7)} ${r2(MID + w)} ${r2(y)}`,
      weight: 2,
    });
  }
  return out;
}

function buildEyes(
  family: Family,
  g: (typeof SHAPE)[Family],
  headR: number,
): Shape[] {
  if (family === "swarm") {
    // A swarm has no face; a single cold core reads better than many eyes.
    return [{ kind: "circle", cx: MID, cy: r2(g.cy), r: 2.6, filled: true }];
  }
  const dx = headR * 0.42;
  const dy = family === "beast" ? g.headY - headR * 0.1 : g.headY - headR * 0.18;
  const r = family === "undead" ? 2.8 : 2.1;
  return mirroredCircle(MID + dx, dy, r, true);
}

function buildMarks(
  i: CreatureSpecInput,
  g: (typeof SHAPE)[Family],
  halfW: number,
): Shape[] {
  const out: Shape[] = [];
  const hasWeak = !!i.weakTo && i.weakTo !== "none";
  const hasResist = !!i.resistTo && i.resistTo !== "none";

  if (hasWeak) {
    // A fracture running down the flank — where it breaks.
    out.push({
      kind: "path",
      d: `M${r2(MID - halfW * 0.5)} ${r2(g.cy - 8)} L${r2(MID - halfW * 0.2)} ${r2(g.cy)} L${r2(MID - halfW * 0.55)} ${r2(g.cy + 7)}`,
      weight: 2,
    });
  }
  if (hasResist) {
    // A closed arc over the shoulder — where it holds.
    out.push({
      kind: "path",
      d: `M${r2(MID + halfW * 0.2)} ${r2(g.cy - 12)} Q${r2(MID + halfW * 1.15)} ${r2(g.cy - 6)} ${r2(MID + halfW * 0.35)} ${r2(g.cy + 6)}`,
      weight: 2,
    });
  }
  return out;
}

/** Test seam — the memo cache is module-global by design. */
export function __clearCreatureCache(): void {
  cache.clear();
}

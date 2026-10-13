import { describe, expect, it, vi } from "vitest";
import {
  VARIANTS,
  __bounds,
  __clearImpactCache,
  gestureForLane,
  impactSpec,
  impactVariant,
  type ImpactSpec,
} from "./impact";
import { FIELD } from "./seed";
import { weaponLane } from "./archetypes";
import { weaponTypesFor, type Preset } from "@/lib/engine/types";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

/** Every lane the engine can produce, plus the unarmed and out-of-range cases. */
const LANES = [0, 1, 2, 3, 4, 5];

function allShapes(spec: ImpactSpec) {
  const out = [...spec.strokes];
  if (spec.ring) out.push({ kind: "circle" as const, ...spec.ring });
  return out;
}

/** Every coordinate a shape puts on screen, including curve control points. */
function coords(spec: ImpactSpec): number[] {
  const out: number[] = [];
  for (const s of allShapes(spec)) {
    if (s.kind === "circle") {
      out.push(s.cx - s.r, s.cx + s.r, s.cy - s.r, s.cy + s.r);
    } else {
      for (const n of s.d.match(/-?\d+(\.\d+)?/g) ?? []) out.push(Number(n));
    }
  }
  return out;
}

/** Cartesian sweep of every lane × every variant — the whole output space. */
function everySpec(): { lane: number; variant: number; spec: ImpactSpec }[] {
  const out: { lane: number; variant: number; spec: ImpactSpec }[] = [];
  for (const lane of LANES) {
    for (let variant = 0; variant < VARIANTS; variant++) {
      out.push({ lane, variant, spec: impactSpec(lane, variant) });
    }
  }
  return out;
}

describe("gestureForLane", () => {
  it("gives each engine lane its own gesture", () => {
    const gestures = [1, 2, 3, 4, 5].map(gestureForLane);
    expect(new Set(gestures).size).toBe(5);
  });

  it("never leaves a lane without a mark", () => {
    // Unarmed (0) and any lane past the vocabulary — a player realm shipping a
    // longer weapon list — must still strike something. This is the
    // no-holes guarantee the rest of the art layer makes.
    for (const lane of [0, 6, 9, 255, -1]) {
      expect(gestureForLane(lane)).toBe("burst");
    }
  });

  it("covers every weapon type in every preset's vocabulary", () => {
    for (const preset of PRESETS) {
      for (const type of weaponTypesFor(preset)) {
        const spec = impactSpec(weaponLane(preset, type), 3);
        expect(spec.strokes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("impactVariant", () => {
  it("folds a monotonic hit count into the cycle", () => {
    expect(impactVariant(0)).toBe(0);
    expect(impactVariant(VARIANTS)).toBe(0);
    expect(impactVariant(VARIANTS + 3)).toBe(3);
  });

  it("stays in range for absurd and negative counts", () => {
    for (const n of [-1, -9, 0, 1, 999, 100_000]) {
      const v = impactVariant(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(VARIANTS);
    }
  });
});

describe("impactSpec", () => {
  it("is deterministic across a cold cache", () => {
    __clearImpactCache();
    const first = everySpec().map(({ spec }) => JSON.stringify(spec));
    __clearImpactCache();
    const second = everySpec().map(({ spec }) => JSON.stringify(spec));
    expect(second).toEqual(first);
  });

  it("varies within a lane, so a blow is not a decal", () => {
    // The whole reason this generator is allowed to vary at all: replaying one
    // frozen mark on every swing reads as a sticker on the screen.
    for (const lane of LANES) {
      const seen = new Set<string>();
      for (let v = 0; v < VARIANTS; v++) {
        seen.add(JSON.stringify(impactSpec(lane, v)));
      }
      expect(seen.size).toBe(VARIANTS);
    }
  });

  it("cycles rather than growing without bound", () => {
    // Seeding on the raw hit count would leave a few hundred dead cache
    // entries by the end of a long delve.
    expect(JSON.stringify(impactSpec(3, 2))).toBe(
      JSON.stringify(impactSpec(3, 2 + VARIANTS * 7)),
    );
  });

  it("gives different lanes different blows", () => {
    const perLane = LANES.map((lane) => JSON.stringify(impactSpec(lane, 0)));
    // Lane 0 and lanes past the vocabulary share the burst gesture by design,
    // but the five real lanes must all be distinct.
    expect(new Set(perLane.slice(1)).size).toBe(5);
  });

  it("keeps every mark inside the field", () => {
    for (const { lane, variant, spec } of everySpec()) {
      for (const n of coords(spec)) {
        expect(
          n,
          `lane ${lane} variant ${variant} (${spec.gesture}) escaped the field`,
        ).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(FIELD);
      }
    }
  });

  it("builds containment from the reach budget, not from clamping", () => {
    // Containment is meant to hold *by construction*: every point sits within
    // REACH of a contact point that itself sits inside the centre band. If a
    // mark ever had to be clamped to stay in frame, a converging pierce would
    // silently bend. So assert the budget directly, not just the field.
    const { REACH, CENTRE_X, CENTRE_Y } = __bounds;
    const worstX = Math.max(CENTRE_X[1] + REACH, FIELD - (CENTRE_X[0] - REACH));
    const worstY = Math.max(CENTRE_Y[1] + REACH, FIELD - (CENTRE_Y[0] - REACH));
    expect(worstX).toBeLessThanOrEqual(FIELD);
    expect(worstY).toBeLessThanOrEqual(FIELD);
  });

  it("carries no colour", () => {
    for (const { spec } of everySpec()) {
      const json = JSON.stringify(spec);
      expect(json).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(json).not.toMatch(/var\(|color-mix\(/);
    }
  });

  it("emits only parseable path data", () => {
    for (const { spec } of everySpec()) {
      for (const s of allShapes(spec)) {
        if (s.kind === "path") {
          expect(s.d).toMatch(/^[MLCQAZHVmlcqazhv0-9 .,-]+$/);
          expect(s.d).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });

  it("gives cutting gestures no ring and radial ones a ring", () => {
    // The ring is an entry wound / detonation core. A cleave shouldn't have
    // one; a shot or a bloom is unreadable without it.
    for (const { spec } of everySpec()) {
      const radial = ["pierce", "bloom", "burst"].includes(spec.gesture);
      expect(spec.ring === null).toBe(!radial);
    }
  });

  it("keeps a pierce's trails clear of its own ring", () => {
    // The trails are supposed to read as arriving at the wound. If one
    // overshoots into the ring the mark turns into a scribble.
    for (let v = 0; v < VARIANTS; v++) {
      const spec = impactSpec(4, v);
      const ring = spec.ring;
      if (!ring) throw new Error("a pierce must have a ring");
      for (const s of spec.strokes) {
        if (s.kind !== "path") throw new Error("expected trails to be paths");
        const [, , x, y] = (s.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        const d = Math.hypot((x ?? 0) - ring.cx, (y ?? 0) - ring.cy);
        expect(d).toBeGreaterThan(ring.r);
      }
    }
  });

  it("keeps a slash reading as a cut, not a crosshair", () => {
    // Two strokes ~80° apart form an X only while the pair straddles the
    // diagonals. Let one drift onto the vertical and the same geometry reads
    // as a crosshair instead — which is what it did before the band below.
    for (let v = 0; v < VARIANTS; v++) {
      for (const s of impactSpec(3, v).strokes) {
        if (s.kind !== "path") throw new Error("expected a slash to be paths");
        const [x1, y1, x2, y2] = (s.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        // Angle off the vertical, folded into [0°, 180°).
        const deg =
          (((Math.atan2((x2 ?? 0) - (x1 ?? 0), (y1 ?? 0) - (y2 ?? 0)) * 180) /
            Math.PI +
            180) %
            180) +
          0;
        for (const axis of [0, 90, 180]) {
          expect(Math.abs(deg - axis)).toBeGreaterThan(10);
        }
      }
    }
  });

  it("stays within the node budget", () => {
    for (const { spec } of everySpec()) {
      expect(allShapes(spec).length).toBeLessThanOrEqual(8);
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
      __clearImpactCache();
      expect(() => everySpec()).not.toThrow();
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });
});

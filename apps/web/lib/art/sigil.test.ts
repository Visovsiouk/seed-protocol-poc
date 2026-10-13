import { describe, expect, it, vi } from "vitest";
import { __clearSigilCache, sigilSpec } from "./sigil";
import { FIELD } from "./seed";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

type Spec = ReturnType<typeof sigilSpec>;

function shapes(spec: Spec) {
  return [...spec.rings, ...spec.spokes, ...spec.satellites, spec.core];
}

function coords(spec: Spec): number[] {
  const out: number[] = [];
  for (const s of shapes(spec)) {
    if (s.kind === "circle") out.push(s.cx - s.r, s.cx + s.r, s.cy - s.r, s.cy + s.r);
    else for (const n of s.d.match(/-?\d+(\.\d+)?/g) ?? []) out.push(Number(n));
  }
  return out;
}

/** A pseudo-address built from a repeating nibble, for edge sweeps. */
function uniform(nibble: string): string {
  return `0x${nibble.repeat(40)}`;
}

describe("sigilSpec", () => {
  it("is deterministic across a cold cache", () => {
    __clearSigilCache();
    const first = JSON.stringify(sigilSpec(A));
    __clearSigilCache();
    expect(JSON.stringify(sigilSpec(A))).toBe(first);
  });

  it("gives different addresses different crests", () => {
    expect(JSON.stringify(sigilSpec(A))).not.toBe(JSON.stringify(sigilSpec(B)));
  });

  it("is case-insensitive — checksummed and lowercase agree", () => {
    // The same wallet must not change shape because a caller lowercased it.
    expect(JSON.stringify(sigilSpec(A))).toBe(
      JSON.stringify(sigilSpec(A.toLowerCase())),
    );
  });

  it("reads the address rather than a hash of it", () => {
    // Two addresses differing in one nibble must differ in exactly the
    // feature that nibble drives — ring count (nibble 0) — and not avalanche
    // into everything. This is the property that makes the crest *be* the
    // address rather than merely derived from it.
    const base = sigilSpec(`0x1${"0".repeat(39)}`);
    const bumped = sigilSpec(`0x2${"0".repeat(39)}`);
    expect(bumped.rings.length).not.toBe(base.rings.length);
    expect(JSON.stringify(bumped.core)).toBe(JSON.stringify(base.core));
  });

  it("falls back to a placeholder for missing or malformed input", () => {
    for (const bad of [undefined, null, "", "0x", "not-an-address", "0x1234"]) {
      const spec = sigilSpec(bad as string | null | undefined);
      expect(spec.placeholder).toBe(true);
      expect(spec.rings.length).toBeGreaterThan(0);
    }
  });

  it("marks a real address as non-placeholder", () => {
    expect(sigilSpec(A).placeholder).toBe(false);
  });

  it("always produces a core, rings, spokes and satellites", () => {
    for (let i = 0; i < 16; i++) {
      const spec = sigilSpec(uniform(i.toString(16)));
      expect(spec.rings.length).toBeGreaterThanOrEqual(2);
      expect(spec.spokes).toHaveLength(6);
      expect(spec.satellites).toHaveLength(4);
      expect(spec.core.kind).toBe("path");
    }
  });

  it("never lets two rings merge into one line", () => {
    // Independently-chosen radii once landed 1.3 units apart, which at a 40px
    // render is half a pixel — the two rings draw as a single thick stroke and
    // the crest silently loses a feature.
    const addrs = [A, B, ...Array.from({ length: 16 }, (_, i) => uniform(i.toString(16)))];
    for (const addr of addrs) {
      const radii = sigilSpec(addr)
        .rings.map((r) => (r.kind === "circle" ? r.r : 0))
        .sort((x, y) => x - y);
      for (let k = 1; k < radii.length; k++) {
        expect(radii[k]! - radii[k - 1]!).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the innermost ring clear of the core", () => {
    const addrs = [A, B, ...Array.from({ length: 16 }, (_, i) => uniform(i.toString(16)))];
    for (const addr of addrs) {
      const spec = sigilSpec(addr);
      const smallest = Math.min(
        ...spec.rings.map((r) => (r.kind === "circle" ? r.r : Infinity)),
      );
      // Core polygon tops out at radius 13.
      expect(smallest).toBeGreaterThan(13);
    }
  });

  it("gives every crest the same outer weight", () => {
    // Ring count must not change how big the crest reads, or a 2-ring wallet
    // looks like a different class of thing from a 4-ring one.
    const outers = [A, B, ...Array.from({ length: 16 }, (_, i) => uniform(i.toString(16)))].map(
      (addr) =>
        Math.max(...sigilSpec(addr).rings.map((r) => (r.kind === "circle" ? r.r : 0))),
    );
    expect(Math.min(...outers)).toBeGreaterThanOrEqual(32);
    expect(Math.max(...outers)).toBeLessThanOrEqual(42);
  });

  it("keeps every crest inside the field", () => {
    const addrs = [A, B, ...Array.from({ length: 16 }, (_, i) => uniform(i.toString(16)))];
    for (const addr of addrs) {
      for (const n of coords(sigilSpec(addr))) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(FIELD);
      }
    }
  });

  it("is mirror-symmetric about the vertical axis", () => {
    // Spokes and satellites are emitted in mirrored pairs; a pair whose two
    // halves sit on the same side would read as noise, not a crest.
    const spec = sigilSpec(A);
    for (let k = 0; k < spec.satellites.length; k += 2) {
      const l = spec.satellites[k]!;
      const r = spec.satellites[k + 1]!;
      if (l.kind !== "circle" || r.kind !== "circle") throw new Error("expected circles");
      expect(l.cx + r.cx).toBeCloseTo(100, 1);
      expect(l.cy).toBeCloseTo(r.cy, 1);
      expect(l.r).toBe(r.r);
    }
  });

  it("never collapses a mirrored spoke pair onto itself", () => {
    // A spoke on the vertical axis would mirror onto its own position,
    // doubling the stroke and wasting a node.
    for (let i = 0; i < 16; i++) {
      const spec = sigilSpec(uniform(i.toString(16)));
      for (let k = 0; k < spec.spokes.length; k += 2) {
        const left = spec.spokes[k]!;
        const right = spec.spokes[k + 1]!;
        if (left.kind !== "path" || right.kind !== "path") {
          throw new Error("expected spokes to be paths");
        }
        expect(left.d).not.toBe(right.d);
      }
    }
  });

  it("carries no colour", () => {
    const json = JSON.stringify(sigilSpec(A));
    expect(json).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(json).not.toMatch(/var\(|color-mix\(/);
  });

  it("emits only parseable path data", () => {
    for (const s of shapes(sigilSpec(A))) {
      if (s.kind === "path") expect(s.d).toMatch(/^[MLCQAZHVmlcqazhv0-9 .,-]+$/);
    }
  });

  it("stays within the node budget", () => {
    expect(shapes(sigilSpec(A)).length).toBeLessThanOrEqual(16);
  });

  it("is SSR-safe", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("nondeterminism on the render path");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("nondeterminism on the render path");
    });
    try {
      __clearSigilCache();
      expect(() => {
        sigilSpec(A);
        sigilSpec(undefined);
      }).not.toThrow();
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });
});

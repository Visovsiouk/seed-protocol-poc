import { describe, expect, it } from "vitest";
import { COLD_OPEN_BOOK, COLD_OPEN_STORAGE_KEY } from "./coldOpen";

describe("cold-open — the branding at the threshold", () => {
  it("has five beats walking arrival → wake", () => {
    expect(COLD_OPEN_BOOK).toHaveLength(5);
  });

  it("every beat carries the ledger shape the component renders", () => {
    for (const beat of COLD_OPEN_BOOK) {
      expect(beat.stamp).toMatch(/.+/);
      expect(beat.cta).toMatch(/.+/);
      expect(beat.body.length).toBeGreaterThan(0);
      for (const para of beat.body) {
        expect(para).toMatch(/.+/);
      }
    }
  });

  it("final beat is the wake — it's the CTA that hands off to /play/fantasy", () => {
    const last = COLD_OPEN_BOOK[COLD_OPEN_BOOK.length - 1]!;
    expect(last.cta).toBe("Wake");
  });

  it("storage key is versioned so a future rewrite can re-introduce the opening", () => {
    expect(COLD_OPEN_STORAGE_KEY).toBe("seed-protocol:cold-open-consumed.v3");
    expect(COLD_OPEN_STORAGE_KEY).toMatch(/\.v\d+$/);
  });
});

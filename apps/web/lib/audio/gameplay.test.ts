import { describe, expect, it, vi } from "vitest";
import type { CombatBeat, EngineEvent } from "@/lib/engine/types";
import { BEAT_STAGGER_MS, playBeats, sfxForBeat, sfxForEvent } from "./gameplay";
import { SFX, SFX_MIN_INTERVAL_MS } from "./manifest";

const beat = (over: Partial<CombatBeat> = {}): CombatBeat => ({
  actor: "player",
  hit: true,
  crit: false,
  fumble: false,
  dodged: false,
  damage: 5,
  ...over,
});

describe("sfxForBeat", () => {
  it("distinguishes dealing damage from taking it", () => {
    // The point of keying off `actor`: a player should be able to tell
    // which way the damage went without reading the log.
    expect(sfxForBeat(beat({ actor: "player" }))).toBe("hit");
    expect(sfxForBeat(beat({ actor: "monster" }))).toBe("hurt");
  });

  it("gives the player's crit its own voice", () => {
    expect(sfxForBeat(beat({ crit: true }))).toBe("crit");
  });

  it("treats a miss and a fumble alike", () => {
    expect(sfxForBeat(beat({ hit: false }))).toBe("miss");
    expect(sfxForBeat(beat({ hit: false, fumble: true }))).toBe("miss");
  });

  it("prefers dodge over miss for an evaded monster swing", () => {
    // A dodge is the player's doing; it should not sound like the
    // monster simply whiffing.
    const dodged = beat({ actor: "monster", hit: false, dodged: true });
    expect(sfxForBeat(dodged)).toBe("dodge");
  });

  it("only ever names a voice that exists in the manifest", () => {
    for (const actor of ["player", "monster"] as const) {
      for (const hit of [true, false]) {
        for (const crit of [true, false]) {
          for (const dodged of [true, false]) {
            const id = sfxForBeat(beat({ actor, hit, crit, dodged }));
            expect(SFX[id]).toBeDefined();
          }
        }
      }
    }
  });
});

describe("sfxForEvent", () => {
  const events: EngineEvent[] = [
    { type: "RoomCleared", depth: 2 },
    { type: "BossCleared", finalHp: 12, turns: 9 },
    { type: "LootDropped", loot: {} as never },
    { type: "PlayerDefeated", depth: 3, turn: 7 },
    { type: "Extracted", count: 2 },
  ];

  it("maps run outcomes to their stings", () => {
    expect(sfxForEvent({ type: "BossCleared", finalHp: 1, turns: 1 })).toBe(
      "victory",
    );
    expect(sfxForEvent({ type: "PlayerDefeated", depth: 1, turn: 1 })).toBe(
      "defeat",
    );
  });

  it("stays silent on RoomCleared", () => {
    // It coincides with the killing blow and the loot drop; a third
    // sound in that window just muddies the two that matter.
    expect(sfxForEvent({ type: "RoomCleared", depth: 1 })).toBeNull();
  });

  it("names a real voice or nothing, for every event variant", () => {
    for (const ev of events) {
      const id = sfxForEvent(ev);
      if (id !== null) expect(SFX[id]).toBeDefined();
    }
  });
});

describe("playBeats", () => {
  it("fires the first beat synchronously so the click feels immediate", () => {
    const play = vi.fn();
    playBeats([beat()], play);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("hit");
  });

  it("staggers simultaneous swings so a multi-hit is audible as two", () => {
    vi.useFakeTimers();
    try {
      const play = vi.fn();
      playBeats([beat(), beat({ crit: true }), beat()], play);
      // Only the first has landed.
      expect(play.mock.calls).toEqual([["hit"]]);

      vi.advanceTimersByTime(BEAT_STAGGER_MS);
      expect(play.mock.calls).toEqual([["hit"], ["crit"]]);

      vi.advanceTimersByTime(BEAT_STAGGER_MS);
      expect(play.mock.calls).toEqual([["hit"], ["crit"], ["hit"]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("staggers wider than the throttle, or repeats would be swallowed", () => {
    // This is the whole reason the stagger exists: `play()` drops a
    // repeat of the same voice inside SFX_MIN_INTERVAL_MS, so two hits
    // in one step would collapse into one impact.
    expect(BEAT_STAGGER_MS).toBeGreaterThan(SFX_MIN_INTERVAL_MS);
  });

  it("does nothing for a step with no swings", () => {
    const play = vi.fn();
    playBeats([], play);
    expect(play).not.toHaveBeenCalled();
  });
});

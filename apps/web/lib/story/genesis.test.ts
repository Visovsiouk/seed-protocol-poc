import { describe, expect, it } from "vitest";
import { genesisRespawnVoice, respawnVoiceFor } from "./genesis";

describe("respawnVoiceFor", () => {
  it("returns a distinct bank per preset (vocabulary actually swaps)", () => {
    const fantasy = respawnVoiceFor("fantasy", 2);
    const cyberpunk = respawnVoiceFor("cyberpunk", 2);
    const scifi = respawnVoiceFor("scifi", 2);
    expect(fantasy.death).not.toBe(cyberpunk.death);
    expect(cyberpunk.death).not.toBe(scifi.death);
    expect(scifi.death).not.toBe(fantasy.death);
  });

  it("each bank has at least four scripted attempts (the confusion → resolve arc)", () => {
    for (const preset of ["fantasy", "cyberpunk", "scifi"] as const) {
      const a2 = respawnVoiceFor(preset, 2);
      const a3 = respawnVoiceFor(preset, 3);
      const a4 = respawnVoiceFor(preset, 4);
      const a5 = respawnVoiceFor(preset, 5);
      expect(a2.death).not.toBe(a3.death);
      expect(a3.death).not.toBe(a4.death);
      expect(a4.death).not.toBe(a5.death);
    }
  });

  it("falls back to the late-game voice past the scripted arc", () => {
    const late = respawnVoiceFor("fantasy", 99);
    expect(late.death).toMatch(/.+/);
    expect(late.respawn.length).toBeGreaterThan(0);
  });

  it("defensive: invalid sub-attempt-2 still returns the first attempt's voice", () => {
    const before = respawnVoiceFor("cyberpunk", 1);
    const first = respawnVoiceFor("cyberpunk", 2);
    expect(before.death).toBe(first.death);
  });
});

describe("genesisRespawnVoice (back-compat)", () => {
  it("delegates to the fantasy bank", () => {
    expect(genesisRespawnVoice(2)).toEqual(respawnVoiceFor("fantasy", 2));
    expect(genesisRespawnVoice(5)).toEqual(respawnVoiceFor("fantasy", 5));
  });
});

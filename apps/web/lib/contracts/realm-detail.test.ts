import { describe, expect, it } from "vitest";
import { resolveRealmDetail } from "./realm-detail";
import type { RealmSummary } from "@/lib/reads/types";
import type { StarterRealmEntry } from "./starter-realms";

const FANTASY: `0x${string}` = "0x000000000000000000000000000000000000fa11";
const SCIFI: `0x${string}` = "0x000000000000000000000000000000000000c1f1";
const CREATOR: `0x${string}` = "0x00000000000000000000000000000000000000a1";
const OWNER: `0x${string}` = "0x000000000000000000000000000000000000c0c0";

function summary(
  addr: `0x${string}`,
  active = true,
  createdAt = 1n,
): RealmSummary {
  return { address: addr, owner: OWNER, createdAt, active };
}

function starter(
  preset: "fantasy" | "scifi" | "cyberpunk",
  realm: `0x${string}`,
): StarterRealmEntry {
  return {
    preset,
    realm,
    bossId: `boss_${preset}`,
    name: `${preset} starter`,
    tagline: "x",
    bossDepth: 6,
    defeatMode: "permadeath",
  };
}

describe("resolveRealmDetail", () => {
  it("returns a starter detail when the address matches a starter entry", () => {
    const result = resolveRealmDetail({
      address: FANTASY,
      registry: [summary(FANTASY)],
      starters: [starter("fantasy", FANTASY)],
    });
    expect(result.kind).toBe("starter");
    if (result.kind !== "starter") throw new Error("expected starter");
    expect(result.preset).toBe("fantasy");
    expect(result.bossId).toBe("boss_fantasy");
    expect(result.onchain.active).toBe(true);
  });

  it("returns a creator detail when the address is registered but not a starter", () => {
    const result = resolveRealmDetail({
      address: CREATOR,
      registry: [summary(CREATOR, true, 42n)],
      starters: [starter("fantasy", FANTASY)],
    });
    expect(result.kind).toBe("creator");
    if (result.kind !== "creator") throw new Error("expected creator");
    expect(result.onchain.createdAt).toBe(42n);
  });

  it("returns unknown when the address isn't in the registry", () => {
    const result = resolveRealmDetail({
      address: CREATOR,
      registry: [summary(FANTASY)],
      starters: [starter("fantasy", FANTASY)],
    });
    expect(result.kind).toBe("unknown");
  });

  it("matches addresses case-insensitively across registry and starter lookup", () => {
    const upper = SCIFI.toUpperCase() as `0x${string}`;
    const result = resolveRealmDetail({
      address: upper,
      registry: [summary(SCIFI)],
      starters: [starter("scifi", SCIFI)],
    });
    expect(result.kind).toBe("starter");
    if (result.kind !== "starter") throw new Error("expected starter");
    expect(result.preset).toBe("scifi");
  });

  it("preserves the registry's checksum casing on the returned address", () => {
    // The registry is the source of truth for the canonical address — the
    // dashboard renders the registry-supplied casing, not the URL input.
    const lowered = FANTASY.toLowerCase() as `0x${string}`;
    const registryCased: `0x${string}` =
      "0x000000000000000000000000000000000000FA11";
    const result = resolveRealmDetail({
      address: lowered,
      registry: [summary(registryCased)],
      starters: [starter("fantasy", FANTASY)],
    });
    if (result.kind !== "starter") throw new Error("expected starter");
    expect(result.address).toBe(registryCased);
  });
});

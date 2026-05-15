import { describe, expect, it } from "vitest";
import { buildRealmDisplay, type StarterRealmInput } from "./realm-display";
import type { RealmSummary } from "@/lib/reads/types";

const FANTASY: `0x${string}` = "0x000000000000000000000000000000000000fa11";
const SCIFI: `0x${string}` = "0x000000000000000000000000000000000000c1f1";
const CYBER: `0x${string}` = "0x000000000000000000000000000000000000c10c";
const CREATOR_A: `0x${string}` = "0x00000000000000000000000000000000000000a1";
const CREATOR_B: `0x${string}` = "0x00000000000000000000000000000000000000b2";
const OWNER: `0x${string}` = "0x000000000000000000000000000000000000c0c0";

function summary(addr: `0x${string}`, active: boolean, createdAt = 1n): RealmSummary {
  return { address: addr, owner: OWNER, createdAt, active };
}

function starter(
  preset: "fantasy" | "scifi" | "cyberpunk",
  realm: `0x${string}`,
): StarterRealmInput {
  return { preset, realm, bossId: `boss_${preset}`, name: preset, tagline: "x" };
}

describe("buildRealmDisplay", () => {
  it("emits starters first in preset order, then creator realms by createdAt asc", () => {
    const starters = [
      starter("fantasy", FANTASY),
      starter("scifi", SCIFI),
      starter("cyberpunk", CYBER),
    ];
    const registry = [
      summary(CREATOR_B, true, 200n),
      summary(FANTASY, true),
      summary(CREATOR_A, true, 100n),
      summary(SCIFI, true),
    ];
    const result = buildRealmDisplay({ starters, registry });
    expect(result.map((r) => r.kind)).toEqual([
      "starter",
      "starter",
      "starter",
      "creator",
      "creator",
    ]);
    expect(result[0]!.kind === "starter" && result[0].preset).toBe("fantasy");
    expect(result[1]!.kind === "starter" && result[1].preset).toBe("scifi");
    expect(result[2]!.kind === "starter" && result[2].preset).toBe("cyberpunk");
    expect(result[3]!.kind === "creator" && result[3].address).toBe(CREATOR_A);
    expect(result[4]!.kind === "creator" && result[4].address).toBe(CREATOR_B);
  });

  it("renders a not-deployed starter slot when the seeder hasn't run", () => {
    const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;
    const starters = [starter("fantasy", ZERO)];
    const result = buildRealmDisplay({ starters, registry: [] });
    expect(result).toHaveLength(1);
    const card = result[0]!;
    expect(card.kind).toBe("starter");
    if (card.kind === "starter") {
      expect(card.deployed).toBe(false);
      expect(card.onchain).toBeUndefined();
      expect(card.ready).toBe(false);
    }
  });

  it("marks a deployed-but-inactive starter ready=false", () => {
    const starters = [starter("fantasy", FANTASY)];
    const result = buildRealmDisplay({
      starters,
      registry: [summary(FANTASY, false)],
    });
    const card = result[0]!;
    if (card.kind !== "starter") throw new Error("expected starter");
    expect(card.deployed).toBe(true);
    expect(card.onchain?.active).toBe(false);
    expect(card.ready).toBe(false);
  });

  it("matches starter address case-insensitively against the registry", () => {
    const starters = [starter("fantasy", FANTASY.toUpperCase() as `0x${string}`)];
    const result = buildRealmDisplay({
      starters,
      registry: [summary(FANTASY, true)],
    });
    const card = result[0]!;
    if (card.kind !== "starter") throw new Error("expected starter");
    expect(card.ready).toBe(true);
  });

  it("excludes starters from the creator list even when their address appears in the registry", () => {
    const starters = [starter("fantasy", FANTASY)];
    const result = buildRealmDisplay({
      starters,
      registry: [summary(FANTASY, true), summary(CREATOR_A, true)],
    });
    const creators = result.filter((r) => r.kind === "creator");
    expect(creators).toHaveLength(1);
    expect(creators[0]!.kind === "creator" && creators[0].address).toBe(CREATOR_A);
  });
});

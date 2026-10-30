import { describe, it, expect } from "vitest";
import {
  resolveStagingRealm,
  type PlayerRealmsState,
} from "./staging-resolve";
import type { StarterRealmInput } from "@/lib/contracts/realm-display";
import type { PlayerRealmMeta } from "@/lib/reads/hooks";

const STARTERS: StarterRealmInput[] = [
  {
    preset: "fantasy",
    realm: "0x8daf17a20c9dba35f005b6324f493785d239719d",
    bossId: "forest_hag",
    name: "The Hollow Reach",
    tagline: "An unfinished world.",
  },
];

/** Checksummed, as `EcosystemRegistry` hands it back. */
const CREATOR = "0x35dd738E306d32f2709824B6f744f188DA01D3C5" as const;

const REGISTERED: PlayerRealmMeta = {
  address: CREATOR,
  owner: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  preset: "cyberpunk",
  bossId: "chrome_saint",
  name: "Neon Cut",
  accent: "#ff00aa",
  maxTier: 3,
  distinctClearers: 4,
  nextTierAt: 20,
  totalMints: 11,
  createdAt: 123,
  // The common case: no model ever wrote this page's prose. Callers resolve
  // null through `realmPageFallback()`, which staging doesn't touch.
  lore: null,
};

const settledEmpty: PlayerRealmsState = {
  data: new Map(),
  isPending: false,
  isError: false,
};
const pending: PlayerRealmsState = {
  data: undefined,
  isPending: true,
  isError: false,
};
const failed: PlayerRealmsState = {
  data: undefined,
  isPending: false,
  isError: true,
};

function resolveCreator(playerRealms: PlayerRealmsState) {
  return resolveStagingRealm({
    selection: { kind: "creator", address: CREATOR },
    starters: STARTERS,
    playerRealms,
  });
}

describe("resolveStagingRealm — starter doors", () => {
  it("resolves a configured starter with no custom accent", () => {
    const res = resolveStagingRealm({
      selection: { kind: "starter", preset: "fantasy" },
      starters: STARTERS,
      playerRealms: pending,
    });
    expect(res).toEqual({
      status: "ready",
      trial: false,
      resolved: {
        preset: "fantasy",
        realm: STARTERS[0]!.realm,
        name: "The Hollow Reach",
        accent: null,
      },
    });
  });

  it("errors rather than hanging when the preset has no configured realm", () => {
    const res = resolveStagingRealm({
      selection: { kind: "starter", preset: "scifi" },
      starters: STARTERS,
      playerRealms: settledEmpty,
    });
    expect(res.status).toBe("error");
  });
});

describe("resolveStagingRealm — registered creator realms", () => {
  it("uses the registry row and keeps the creator's accent", () => {
    const res = resolveCreator({
      data: new Map([[CREATOR.toLowerCase(), REGISTERED]]),
      isPending: false,
      isError: false,
    });
    expect(res).toEqual({
      status: "ready",
      trial: false,
      resolved: {
        preset: "cyberpunk",
        realm: CREATOR.toLowerCase(),
        name: "Neon Cut",
        accent: "#ff00aa",
      },
    });
  });

  it("keeps a cached row authoritative when a refetch fails", () => {
    const res = resolveCreator({
      data: new Map([[CREATOR.toLowerCase(), REGISTERED]]),
      isPending: false,
      isError: true,
    });
    expect(res).toMatchObject({ status: "ready", trial: false });
  });
});

describe("resolveStagingRealm — unregistered creator realms", () => {
  // The dead end this module exists to close: a realm listed in
  // `EcosystemRegistry` but absent from `/api/realm/list` used to resolve to
  // null, which the staging screen rendered as "Preparing the doorway…"
  // forever. Post-arc the picker shows *only* creator cards, so with one
  // such realm the player had no way to start any run.
  it("falls back to trial mode once the store has settled without the realm", () => {
    const res = resolveCreator(settledEmpty);
    expect(res).toEqual({
      status: "ready",
      trial: true,
      resolved: {
        preset: "fantasy",
        realm: CREATOR.toLowerCase(),
        name: "Realm 0x35dd…d3c5",
        accent: null,
      },
    });
  });

  it("waits while the store is still pending", () => {
    expect(resolveCreator(pending)).toEqual({ status: "loading" });
  });

  it("surfaces an error — not a guess — when the store is unreachable", () => {
    const res = resolveCreator(failed);
    expect(res.status).toBe("error");
    // Guessing "trial" here could preview HP/AC the registered run contradicts.
    expect(res).not.toMatchObject({ status: "ready" });
  });

  it("matches the lowercased address the play route boots with", () => {
    const res = resolveCreator(settledEmpty);
    if (res.status !== "ready") throw new Error("expected ready");
    expect(res.resolved.realm).toBe(CREATOR.toLowerCase());
  });
});

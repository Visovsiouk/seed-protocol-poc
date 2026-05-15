import { seedSbtAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { getAddress } from "@/lib/contracts/addresses";
import { bossClearedEventAbi } from "@/lib/contracts/boss-cleared-abi";
import {
  starterRealms,
  isStarterRealmDeployed,
} from "@/lib/contracts/starter-realms";
import type { Preset } from "@/lib/engine/types";
import type { BossClearEvent } from "@/lib/tutorial/progress";

/**
 * Tutorial-progress readers.
 *
 * Two on-chain reads back the tutorial overlay:
 *
 *   1. `fetchBossClears(player)` — scans `BossCleared(player, finalHp,
 *      turns)` on each *deployed* starter-realm template, tags each log
 *      with the preset it came from (we know the address→preset mapping
 *      because the starter-realms config is what we're scanning), and
 *      returns the union sorted by block.
 *
 *   2. `fetchHasSeed(player)` — `SeedSBT.balanceOf(player) > 0`. The SBT
 *      is non-transferable so balance ≥ 1 means the player owns it.
 *
 * Both are passed to `deriveTutorialProgress` (already pure and unit-
 * tested) to compute the Act + `eligibleForSeed` state.
 *
 * Starter-realm gating: realms whose configured address is zero are
 * silently skipped — the play page already surfaces a "not deployed yet"
 * notice via `useStarterRealm`. Querying a zero address would return no
 * events anyway but viem would still issue the RPC call.
 */

type StarterRealmEntry = { preset: Preset; realm: `0x${string}` };

function deployedStarterRealms(): StarterRealmEntry[] {
  const out: StarterRealmEntry[] = [];
  for (const [preset, cfg] of Object.entries(starterRealms) as [
    Preset,
    { realm: `0x${string}`; bossId: string },
  ][]) {
    if (isStarterRealmDeployed(cfg.realm)) {
      out.push({ preset, realm: cfg.realm });
    }
  }
  return out;
}

export async function fetchBossClears(
  player: `0x${string}`,
): Promise<BossClearEvent[]> {
  const realms = deployedStarterRealms();
  if (realms.length === 0) return [];

  const client = getReadClient();

  const perRealm = await Promise.all(
    realms.map(async ({ realm, preset }) => {
      const events = await client.getContractEvents({
        address: realm,
        abi: bossClearedEventAbi,
        eventName: "BossCleared",
        args: { player },
        fromBlock: 0n,
        toBlock: "latest",
      });
      return events.map<BossClearEvent>((ev) => ({
        realm,
        preset,
        finalHp: Number(ev.args.finalHp ?? 0),
        turns: Number(ev.args.turns ?? 0),
        // viem's log objects don't carry the block timestamp; we use
        // blockNumber as the ordinal "ts" since the deriver only sorts
        // by it. Real timestamps are a separate `getBlock` per log,
        // which isn't worth the round trip at PoC scale.
        ts: Number(ev.blockNumber),
        blockNumber: ev.blockNumber,
        logIndex: ev.logIndex,
      }));
    }),
  );

  return perRealm.flat();
}

/**
 * SeedSBT balance check. The SBT is soulbound — a balance ≥ 1 means the
 * player owns it. Returns false for zero addresses or RPC failures so
 * the tutorial overlay degrades gracefully.
 */
export async function fetchHasSeed(player: `0x${string}`): Promise<boolean> {
  const client = getReadClient();
  const balance = await client.readContract({
    address: getAddress("seedSBT"),
    abi: seedSbtAbi,
    functionName: "balanceOf",
    args: [player],
  });
  return balance > 0n;
}

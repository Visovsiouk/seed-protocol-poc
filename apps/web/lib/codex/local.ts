/**
 * Client-side codex flags, keyed per player address.
 *
 * Only for moments the chain cannot witness: "carried gear across a preset
 * boundary" is an equipped-state event (equipment is localStorage in the PoC,
 * see lib/persistence/equipped.ts), so its codex step is flagged here when the
 * gear-translation screen renders with foreign-provenance gear. Everything
 * else in the codex derives from on-chain reads and must NOT be cached here.
 */

const STORAGE_KEY = "seed-protocol-poc:codex-flags";

export type CodexLocalFlags = {
  /** Gear minted under preset A was carried into a preset-B descent. */
  crossRealmCarry?: boolean;
  /** The Wandering Trader has bought one of this player's listings. */
  traderHailed?: boolean;
};

type Store = Record<string, CodexLocalFlags>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function loadCodexFlags(player: `0x${string}` | undefined): CodexLocalFlags {
  if (!player) return {};
  return read()[player.toLowerCase()] ?? {};
}

export function setCodexFlag(
  player: `0x${string}` | undefined,
  flag: keyof CodexLocalFlags,
): void {
  if (!player || typeof window === "undefined") return;
  try {
    const store = read();
    const key = player.toLowerCase();
    store[key] = { ...store[key], [flag]: true };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled — the step will simply not stamp this session.
  }
}

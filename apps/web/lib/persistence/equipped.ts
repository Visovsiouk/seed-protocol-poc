/**
 * Session-persistent equipped gear.
 *
 * The play page's `equipped` slots reset to starter gear on every mount
 * because they live in component-local React state. That breaks the cross-
 * realm play loop: a player who farms a fire sword in Greenwood Vale
 * shouldn't lose it when they walk into the Verdant Spire.
 *
 * We persist the equipped pair under a single localStorage key (scope:
 * browser session — there's no chain-side equipment registry in the PoC).
 * `AssetCard.tokenId` is a `bigint` which `JSON.stringify` refuses, so we
 * shuttle it through a `{ __bigint: "decimal" }` tagged form and a matching
 * reviver. Everything else on `AssetCard` is plain JSON.
 */

import type { AssetCard } from "@/lib/engine/types";

const STORAGE_KEY = "seed-protocol-poc:equipped";

export type EquippedSnapshot = {
  weapon?: AssetCard;
  armor?: AssetCard;
};

type BigIntTag = { __bigint: string };

function isBigIntTag(v: unknown): v is BigIntTag {
  return (
    typeof v === "object" &&
    v !== null &&
    "__bigint" in v &&
    typeof (v as { __bigint: unknown }).__bigint === "string"
  );
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { __bigint: value.toString() };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (isBigIntTag(value)) return BigInt(value.__bigint);
  return value;
}

/**
 * Read the persisted snapshot. Returns `null` on SSR (`window` undefined),
 * empty storage, or any parse error — callers should fall back to starter
 * gear in those cases.
 */
export function loadEquipped(): EquippedSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw, reviver) as EquippedSnapshot;
  } catch {
    return null;
  }
}

/** Write the snapshot. No-op on SSR or storage failure (quota / privacy). */
export function saveEquipped(snapshot: EquippedSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot, replacer));
  } catch {
    // Storage full or disabled — equip still works in-session, just won't
    // survive a navigation. Silent because there's nothing the user can do.
  }
}

/** Clear the persisted snapshot (e.g. on disconnect / "reset gear"). */
export function clearEquipped(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same swallow rationale as saveEquipped.
  }
}

"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import type { FaucetResponse } from "@/lib/faucet-server";

/**
 * Faucet-mode helper. Mounted only when `faucetEnabled` is true (see
 * WalletProvider). When a real wallet connects — burner ("Play instantly") or an
 * own wallet (MetaMask/etc.) once it's on Anvil — POSTs the address to
 * `/api/faucet` so a brand-new account on the local anvil chain is funded to the
 * faucet target (10 ETH) before its first signing action. Renders nothing.
 *
 * Once-only, reliably:
 *   - A persistent `faucet:claimed:<address>` localStorage flag means a funded
 *     wallet never re-POSTs on subsequent reloads (the old in-memory Set reset
 *     every reload and re-hammered the route).
 *   - The flag is set ONLY on confirmed success (HTTP 200 + body `ok:true`,
 *     which covers both a fresh fund and an already-funded wallet). A 429
 *     (rate-limited), 500, network error, or `ok:false` leaves the flag UNSET so
 *     the next connect/reload retries — the previous version marked the address
 *     done before the fetch resolved and only retried on network errors, so a
 *     rate-limited call was silently swallowed and the wallet never got funded.
 *   - An in-memory in-flight guard prevents a double-POST while one is pending.
 */

const claimedKey = (address: string) => `faucet:claimed:${address.toLowerCase()}`;

export function AutoFaucet() {
  const { address, isConnected } = useAccount();
  // Addresses with a faucet request currently in flight this mount — prevents a
  // concurrent double-POST. Persistence across reloads is handled by localStorage.
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isConnected || !address) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(claimedKey(address)) === "1") return;
    if (inFlight.current.has(address)) return;
    inFlight.current.add(address);

    void (async () => {
      try {
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const body = (await res.json().catch(() => null)) as FaucetResponse | null;
        if (res.ok && body?.ok) {
          // Funded now, or already at/above target — either way, done for good.
          window.localStorage.setItem(claimedKey(address), "1");
        }
        // 429 / 500 / ok:false: leave the flag unset so the next connect retries.
      } catch {
        // Network error — same: no flag, retry on the next connect of this address.
      } finally {
        inFlight.current.delete(address);
      }
    })();
  }, [address, isConnected]);

  return null;
}

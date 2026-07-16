"use client";

import { useEffect, useRef } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { FaucetResponse } from "@/lib/faucet-server";

/**
 * Faucet-mode helper. Mounted only when `faucetEnabled` is true (see
 * WalletProvider). When a real wallet connects — burner ("Play instantly") or an
 * own wallet (MetaMask/etc.) once it's on Anvil — POSTs the address to
 * `/api/faucet` so the account is funded to the faucet target (10 ETH) before
 * its first signing action. Renders nothing.
 *
 * The "already funded" decision is the CHAIN'S balance, not a browser flag: an
 * earlier version set a persistent `faucet:claimed:<address>` localStorage flag
 * on success, which survived anvil restarts — a chain reset wiped the balance
 * but the stale flag kept AutoFaucet from ever re-funding, and the wallet's
 * next tx died in gas estimation. Reading the live balance is reset-proof, and
 * re-POSTing is safe: the route only tops up below-target wallets
 * (`fundAddress` no-ops at/above target) and is rate-limited per IP.
 *
 *   - Below MIN_BALANCE_WEI → POST /api/faucet, regardless of history.
 *   - One attempt per address per mount (`attempted`) so a failing faucet
 *     isn't hammered by re-renders; a reload or reconnect retries naturally.
 *   - An in-flight guard prevents a double-POST while one is pending.
 *   - Failures are warned to the console (they're non-blocking here — the
 *     Founding Rite does its own pre-deploy balance/faucet guard).
 */

/** Re-fund when the wallet drops below this (0.5 ETH — plenty for gas). */
const MIN_BALANCE_WEI = 500_000_000_000_000_000n;

export function AutoFaucet() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  // Addresses handled this mount: either funded, confirmed rich enough, or
  // attempted-and-failed (retry happens on the next mount/reconnect).
  const attempted = useRef<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isConnected || !address || !publicClient) return;
    if (attempted.current.has(address)) return;
    if (inFlight.current.has(address)) return;
    inFlight.current.add(address);

    void (async () => {
      try {
        const balance = await publicClient.getBalance({ address });
        if (balance >= MIN_BALANCE_WEI) {
          attempted.current.add(address);
          return;
        }

        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const body = (await res.json().catch(() => null)) as FaucetResponse | null;
        attempted.current.add(address);
        if (!res.ok || !body?.ok) {
          console.warn(
            `AutoFaucet: funding ${address} failed`,
            body && !body.ok ? `${body.reason}: ${body.message}` : `HTTP ${res.status}`,
          );
        }
      } catch (e) {
        // Balance read or network error — leave `attempted` unset so the next
        // effect run (reconnect/remount) retries.
        console.warn(`AutoFaucet: funding ${address} errored`, e);
      } finally {
        inFlight.current.delete(address);
      }
    })();
  }, [address, isConnected, publicClient]);

  return null;
}

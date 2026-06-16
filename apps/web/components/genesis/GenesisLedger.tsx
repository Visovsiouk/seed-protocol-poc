"use client";

/**
 * The Seed-claim credential, presented as a *chest with three locks*
 *. Each lock is keyed by one founding realm:
 * defeating that realm's boss turns its key. A locked realm stays sealed
 * and *unnamed* — "?????" — to preserve the next-realm surprise, exactly
 * like the base picker. A cleared realm lights its lock with the realm's
 * own accent and reveals its name. When all three keys have turned the
 * chest opens and the luminous "Claim my Seed" CTA unseals.
 *
 * Reconstructed honestly from chain: it reads the player's per-realm
 * `BossCleared` history via `useTutorialProgress` and posts to
 * `/api/realm/claim-seed`, where the server rebuilds the
 * `ContributionProof` from the same events — the client never supplies a
 * forgeable proof. Renders both as the standalone `/genesis` route and as
 * the Altar station inside the base hub.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Panel, Button, Chip, Stamp, Rule, Footnote } from "@/components/ui";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { useClaimSeed, type ClaimSeedResult } from "@/lib/contracts/seed-claim";

// Ordered fantasy → cyberpunk → scifi (matches REALM_ORDER), so the locks
// read left-to-right in the order the player earns their keys.
const STARTERS = listStarterRealms();

function shortAddr(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function GenesisLedger({
  /**
   * Fired once the Seed mints successfully. The hub passes this to walk the
   * player straight into the Forge station (authorship is now unlocked). When
   * omitted (the standalone `/genesis` deep-link), we fall back to navigating
   * to `/?station=forge` so the destination is the same either way.
   */
  onClaimed,
}: {
  onClaimed?: () => void;
} = {}) {
  const { address } = useAccount();
  const router = useRouter();
  const query = useTutorialProgress(address);
  const progress = query.data ?? emptyTutorialProgress();

  const { claimSeed, isPending, error, walletConnected } = useClaimSeed();
  const [result, setResult] = useState<ClaimSeedResult | null>(null);

  // Lowercased set of realms the player has actually cleared on-chain.
  const clearedByRealm = new Set(progress.cleared.map((c) => c.realm.toLowerCase()));

  const keysTurned = STARTERS.filter((s) =>
    clearedByRealm.has(s.realm.toLowerCase()),
  ).length;
  const allKeysTurned = keysTurned >= STARTERS.length;

  async function handleClaim() {
    try {
      const r = await claimSeed();
      setResult(r);
      // The Seed is the key to authorship — send the player to the Forge.
      if (onClaimed) onClaimed();
      else router.push("/?station=forge");
    } catch {
      // surfaced via `error`
    }
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6">
      <Panel
        as="article"
        tone="glass-2"
        glow="accent"
        aria-label="Seed credential"
        className="flex flex-col gap-5 p-6"
      >
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Stamp>Seed credential</Stamp>
            <span className="font-mono text-[10px] uppercase tracking-widest opacity-65">
              {keysTurned} / {STARTERS.length} keys
            </span>
          </div>
          <Rule />
          <h2 className="font-mono text-2xl font-medium tracking-[-0.015em]">
            {progress.hasSeed
              ? "The Seed is yours"
              : allKeysTurned
                ? "The chest opens"
                : "Three locks, three keys"}
          </h2>
          <p className="max-w-[58ch] text-sm leading-relaxed opacity-75">
            {progress.hasSeed
              ? "Three keys turned, the chest stands open, and the Seed travels with you now — sealed on-chain from the same receipts that earned it."
              : allKeysTurned
                ? "Every lock has turned to its own key. Lift the lid — the server rebuilds your proof from the same on-chain receipts and mints the Seed to your wallet."
                : "The chest answers to three keys, one cut by each founding realm. Each boss you fell turns its lock. The realms still sealed keep their keys — and their names — until you reach them."}
          </p>
        </header>

        {/* The chest: three lock plates, one per founding realm. A turned key
            lights its plate with the realm's accent and reveals the name; a
            sealed lock stays dim and unnamed to preserve the surprise. */}
        <div
          aria-label="The chest's three locks"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {STARTERS.map((s) => {
            const turned = clearedByRealm.has(s.realm.toLowerCase());
            return (
              <div
                key={s.realm}
                data-preset={s.preset}
                aria-label={turned ? `${s.name} — key turned` : "Sealed lock"}
                className="flex flex-col items-center gap-2 rounded-md p-4 text-center transition"
                style={{
                  border: turned
                    ? "1px solid color-mix(in oklab, var(--color-preset-accent) 55%, transparent)"
                    : "1px dashed var(--border-2)",
                  background: turned
                    ? "color-mix(in oklab, var(--color-preset-accent) 9%, var(--surface-1))"
                    : "var(--surface-1)",
                  boxShadow: turned
                    ? "0 0 18px -4px color-mix(in oklab, var(--color-preset-accent) 60%, transparent)"
                    : "none",
                  opacity: turned ? 1 : 0.6,
                }}
              >
                {/* Lock glyph — a padlock that reads open (turned) or shut. */}
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-full text-base font-bold"
                  style={
                    turned
                      ? {
                          background: "var(--color-preset-accent)",
                          color: "var(--color-preset-bg)",
                        }
                      : {
                          border: "1px dashed var(--border-2)",
                          color: "var(--color-preset-fg)",
                        }
                  }
                >
                  {turned ? "🔓" : "🔒"}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ opacity: turned ? 1 : 0.85 }}
                >
                  {turned ? s.name : "?????"}
                </span>
                <Chip
                  color={turned ? "var(--color-preset-accent)" : "var(--border-2)"}
                  label={turned ? "Key turned" : "Sealed"}
                />
              </div>
            );
          })}
        </div>

        <footer className="flex flex-col gap-3 pt-1">
          {progress.hasSeed ? (
            <Chip color="var(--color-ok)" label="Seed claimed" />
          ) : !walletConnected ? (
            <p className="text-sm opacity-70">
              Connect your wallet to claim the Seed bound to your clears.
            </p>
          ) : result ? (
            <Panel
              tone="glass-1"
              className="flex flex-col gap-1 p-3"
              style={{
                borderColor:
                  "color-mix(in oklab, var(--color-ok) 35%, transparent)",
              }}
            >
              <span className="text-sm font-medium text-[var(--color-ok)]">
                Seed minted to your wallet
              </span>
              <span className="font-mono text-[11px] opacity-70">
                via {shortAddr(result.realm)} · tx{" "}
                {result.txHash.slice(0, 10)}…{result.txHash.slice(-6)}
              </span>
            </Panel>
          ) : (
            <>
              <Button
                intent="primary"
                size="lg"
                block
                onClick={handleClaim}
                disabled={!progress.eligibleForSeed || isPending}
              >
                {isPending ? "Minting your Seed…" : "Claim my Seed"}
              </Button>
              {!progress.eligibleForSeed && (
                <p className="text-xs opacity-65">
                  {allKeysTurned
                    ? "All three keys are turned. If the lid stays shut, a community realm clear may still be required (min 3, or however many exist)."
                    : "Turn all three keys — clear all three founding realms — to open the chest."}
                </p>
              )}
              {error && (
                <p className="text-xs text-[var(--color-danger)]">
                  {error.message}
                </p>
              )}
            </>
          )}
        </footer>
      </Panel>

      <Footnote>Reconstructed from on-chain BossCleared receipts</Footnote>
    </section>
  );
}

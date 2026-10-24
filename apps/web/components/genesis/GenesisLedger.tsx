"use client";

/**
 * The signet, presented as the *three stamps that earn it*. Each founding
 * page takes your mark when its bookmark is torn out; the Altar is where a
 * full card is read and the signet is cut — the real on-chain SeedSBT mint.
 * A page still below stays unstamped and unnamed — "?????" — to preserve the
 * next-page surprise, exactly like the base picker. A stamped plate lights
 * with that page's own accent and reveals its name. When all three are down
 * the luminous claim CTA unseals.
 *
 * The turn the whole story rests on happens here: a signet means you *can*
 * sign out, and signing out shuts the book with everyone still inside — so
 * the copy below never offers it as the reward. What it offers is the blank
 * quire.
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
import {
  Panel,
  Button,
  Chip,
  Stamp,
  Rule,
  Footnote,
  ExplorerLink,
} from "@/components/ui";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { useClaimSeed, type ClaimSeedResult } from "@/lib/contracts/seed-claim";

// Ordered fantasy → cyberpunk → scifi (matches REALM_ORDER), so the shards
// read left-to-right in the order the player recovers them.
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

  const shardsRecovered = STARTERS.filter((s) =>
    clearedByRealm.has(s.realm.toLowerCase()),
  ).length;
  const allShardsRecovered = shardsRecovered >= STARTERS.length;

  async function handleClaim() {
    try {
      const r = await claimSeed();
      setResult(r);
      // A signet is what lets a borrower write a page — send them to the Forge.
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
            {/* This heading and its counter were still in the pre-rewrite
                vocabulary (see `RETIRED_TERMS`; not quoted, since the guard
                sweeps this file as plain text) while the body copy two lines
                below already said "Three stamps, one signet" — the same
                widget contradicting itself. */}
            <Stamp>The date-due card</Stamp>
            <span className="font-mono text-[10px] uppercase tracking-widest opacity-65">
              {shardsRecovered} / {STARTERS.length} stamped
            </span>
          </div>
          <Rule />
          <h2 className="font-mono text-2xl font-medium tracking-[-0.015em]">
            {progress.hasSeed
              ? "The signet is yours. Don't sign out."
              : allShardsRecovered
                ? "The card is full. It will cut you a signet."
                : "Three stamps, one signet"}
          </h2>
          <p className="text-sm leading-relaxed opacity-75">
            {progress.hasSeed
              ? "It is soulbound: it cannot be forked, bought, or copied — Vesna Kord is still in the ICE for trying the last one. And it will let you sign out, which is the trap, because the book shuts behind whoever does and everyone still inside stays inside. Press it into a blank quire instead."
              : allShardsRecovered
                ? "Three pages bore your mark deep enough to be vouched for independently, so the book has to admit your name. That is all a signet is — not a reward, a proof. Aurelio Ker earned one in 1908 and used it exactly right, then reached for the last page and was filed into his own work. You get the same choice he got."
                : "Each founding page takes your mark when its bookmark is torn out. The pages still below keep their names until you go down to them. Fill the card and the Altar will read it."}
          </p>
        </header>

        {/* Three stamp plates, one per founding page. A stamped plate lights
            with that page's ink and reveals its name; a page still below stays
            dim and unnamed, so the Book's own "this page is unreadable" and
            this surface agree about what the player is allowed to know. */}
        <div
          aria-label="The three stamps on your card"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {STARTERS.map((s) => {
            const recovered = clearedByRealm.has(s.realm.toLowerCase());
            return (
              <div
                key={s.realm}
                data-preset={s.preset}
                aria-label={recovered ? `${s.name} — stamped` : "Page still below, unstamped"}
                className="flex flex-col items-center gap-2 rounded-md p-4 text-center transition"
                style={{
                  border: recovered
                    ? "1px solid color-mix(in oklab, var(--color-preset-accent) 55%, transparent)"
                    : "1px dashed var(--border-2)",
                  background: recovered
                    ? "color-mix(in oklab, var(--color-preset-accent) 9%, var(--surface-1))"
                    : "var(--surface-1)",
                  boxShadow: recovered
                    ? "0 0 18px -4px color-mix(in oklab, var(--color-preset-accent) 60%, transparent)"
                    : "none",
                  opacity: recovered ? 1 : 0.6,
                }}
              >
                {/* Shard glyph — a faceted sliver, lit when recovered. */}
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-full text-base font-bold"
                  style={
                    recovered
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
                  {recovered ? "◆" : "◇"}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ opacity: recovered ? 1 : 0.85 }}
                >
                  {recovered ? s.name : "?????"}
                </span>
                <Chip
                  color={recovered ? "var(--color-preset-accent)" : "var(--border-2)"}
                  label={recovered ? "Stamped" : "Still below"}
                />
              </div>
            );
          })}
        </div>

        <footer className="flex flex-col gap-3 pt-1">
          {progress.hasSeed ? (
            <Chip color="var(--color-ok)" label="Signet pressed" />
          ) : !walletConnected ? (
            <p className="text-sm opacity-70">
              Connect your wallet to take the signet your stamps have earned.
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
                The card admits your name. The signet is yours, and only yours.
              </span>
              <span className="font-mono text-[11px] opacity-70">
                via{" "}
                <ExplorerLink type="address" value={result.realm}>
                  {shortAddr(result.realm)}
                </ExplorerLink>{" "}
                ·{" "}
                <ExplorerLink type="tx" value={result.txHash}>
                  tx {result.txHash.slice(0, 10)}…{result.txHash.slice(-6)}
                </ExplorerLink>
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
                {isPending ? "Pressing the signet…" : "Press your signet"}
              </Button>
              {!progress.eligibleForSeed && (
                <p className="text-xs opacity-65">
                  Stamp all three founding pages — tear out all three bookmarks
                  — before the card will cut you a signet.
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

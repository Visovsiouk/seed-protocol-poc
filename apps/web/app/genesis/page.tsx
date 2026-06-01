"use client";

/**
 * `/genesis` — the Seed-claim credential page.
 *
 * A stamped credential reconstructed *honestly from chain*: it reads the
 * player's per-realm `BossCleared` history via `useTutorialProgress`, shows
 * the three starter realms as ledger entries (each tinted with its own
 * preset accent), and surfaces the luminous "Claim my Seed" CTA once all
 * three are conquered. On claim it posts to `/api/realm/claim-seed`, where
 * the server rebuilds the `ContributionProof` from the same events and
 * calls `triggerSeedMint` — the client never supplies a forgeable proof.
 *
 * Gated behind `ProtocolSurfaceGate` like the other protocol surfaces, so
 * a player who hasn't cleared the arc is routed home rather than shown an
 * empty credential.
 */

import { useState } from "react";
import { useAccount } from "wagmi";
import { ProtocolSurfaceGate } from "@/components/guards/ProtocolSurfaceGate";
import { AppShell, Panel, Button, Chip, Stamp, Rule, Footnote } from "@/components/ui";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { useClaimSeed, type ClaimSeedResult } from "@/lib/contracts/seed-claim";

const STARTERS = listStarterRealms();

function shortAddr(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function GenesisPage() {
  const { address } = useAccount();
  const query = useTutorialProgress(address);
  const progress = query.data ?? emptyTutorialProgress();

  const { claimSeed, isPending, error, walletConnected } = useClaimSeed();
  const [result, setResult] = useState<ClaimSeedResult | null>(null);

  // Lowercased set of realms the player has actually cleared on-chain.
  const clearedByRealm = new Set(progress.cleared.map((c) => c.realm.toLowerCase()));

  const conquered = STARTERS.filter((s) =>
    clearedByRealm.has(s.realm.toLowerCase()),
  ).length;

  async function handleClaim() {
    try {
      const r = await claimSeed();
      setResult(r);
    } catch {
      // surfaced via `error`
    }
  }

  return (
    <ProtocolSurfaceGate>
      <AppShell title="Genesis" back={{ href: "/", label: "← Home" }}>
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
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  {conquered} / {STARTERS.length} conquered
                </span>
              </div>
              <Rule />
              <h2 className="font-mono text-2xl font-medium tracking-[-0.015em]">
                {progress.hasSeed
                  ? "The Seed is yours"
                  : conquered >= STARTERS.length
                    ? "Three doors walked"
                    : "The credential is incomplete"}
              </h2>
              <p className="max-w-[58ch] text-sm leading-relaxed opacity-75">
                {progress.hasSeed
                  ? "Your contribution across the three founding realms is sealed on-chain. The Seed travels with you now."
                  : conquered >= STARTERS.length
                    ? "Every founding boss has fallen to your hand. Claim the Seed — the server rebuilds your proof from the same on-chain receipts and mints it to your wallet."
                    : "The Seed answers only to those who have walked all three founding doors. Conquer the realms still sealed below."}
              </p>
            </header>

            <ol className="flex flex-col gap-2.5">
              {STARTERS.map((s) => {
                const done = clearedByRealm.has(s.realm.toLowerCase());
                return (
                  <li key={s.realm} data-preset={s.preset}>
                    <Panel
                      tone="glass-1"
                      className="flex items-start gap-3 p-3.5"
                      style={{
                        borderColor: done
                          ? "color-mix(in oklab, var(--color-preset-accent) 45%, transparent)"
                          : undefined,
                      }}
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={
                          done
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
                        {done ? "✓" : "·"}
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span
                            className="text-sm font-medium"
                            style={{ opacity: done ? 1 : 0.55 }}
                          >
                            {s.name}
                          </span>
                          <Chip
                            color="var(--color-preset-accent)"
                            label={done ? "Conquered" : "Sealed"}
                          />
                        </div>
                        <span className="text-[11px] leading-relaxed opacity-60">
                          {s.tagline}
                        </span>
                      </div>
                    </Panel>
                  </li>
                );
              })}
            </ol>

            <footer className="flex flex-col gap-3 pt-1">
              {progress.hasSeed ? (
                <Chip color="var(--color-ok)" label="Seed claimed" />
              ) : !walletConnected ? (
                <p className="text-sm opacity-60">
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
                  <span className="font-mono text-[11px] opacity-60">
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
                    <p className="text-xs opacity-55">
                      {conquered >= STARTERS.length
                        ? "All three starters are clear. If the button stays sealed, a community realm clear may still be required (min 3, or however many exist)."
                        : "Clear all three founding realms to unseal the claim."}
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
      </AppShell>
    </ProtocolSurfaceGate>
  );
}

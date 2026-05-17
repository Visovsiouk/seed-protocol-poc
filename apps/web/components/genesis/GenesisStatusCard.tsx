"use client";

/**
 * `<GenesisStatusCard/>`.
 *
 * The post-onboarding mirror of the in-run `<RealmClearedInterstitial/>`:
 * surfaces tutorial progress (N distinct realms cleared / 3 needed), lists
 * each realm with a deep link, and exposes the Seed claim CTA when the
 * player is eligible. Pulls everything from `useTutorialProgress`, which
 * itself derives state from on-chain `BossCleared` events + the SeedSBT
 * balance — no local copies.
 */

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { useClaimSeed } from "@/lib/contracts/seed-claim";
import { getStarterRealm } from "@/lib/contracts/starter-realms";
import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";

function presetLabel(p: Preset): string {
  return p === "fantasy" ? "Fantasy" : p === "scifi" ? "Sci-Fi" : "Cyberpunk";
}

function relativeTime(ts: number): string {
  if (!ts) return "—";
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function GenesisStatusCard() {
  const { address } = useAccount();
  const progress = useTutorialProgress(address);

  if (!address) {
    return (
      <StatusFrame>
        <h2 className="text-xl font-semibold">Connect to view your shards</h2>
        <p className="text-sm opacity-70 leading-relaxed">
          The Genesis seed is minted from on-chain proof of three distinct
          realm clears. Connect a wallet to see how many shards you&apos;ve
          recovered.
        </p>
      </StatusFrame>
    );
  }

  if (progress.isLoading || !progress.data) {
    return (
      <StatusFrame>
        <p className="text-sm opacity-60">Reading on-chain progress…</p>
      </StatusFrame>
    );
  }

  return <Body progress={progress.data} />;
}

function Body({ progress }: { progress: TutorialProgress }) {
  return (
    <div className="flex flex-col gap-6">
      <StatusFrame>
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {progress.hasSeed
              ? "Genesis Seed claimed"
              : progress.eligibleForSeed
                ? "Ready to claim"
                : `${progress.distinctClears} / 3 shards recovered`}
          </h2>
          <ShardTrack shards={progress.distinctClears} />
        </header>
        <p className="text-sm opacity-75 leading-relaxed">
          {progress.hasSeed
            ? "Your SeedSBT is on-chain. Returning runs skip the tutorial overlay; cross-realm hops and the bazaar are fully unlocked."
            : progress.eligibleForSeed
              ? "Three distinct realms cleared. Claim the Genesis Seed to finalise the tutorial — the server rebuilds the contribution proof from your on-chain clears and submits it through the Genesis ecosystem."
              : "Clear one realm in each of the three presets (Fantasy, Sci-Fi, Cyberpunk) to assemble a proof the Genesis ecosystem will accept."}
        </p>
        {progress.eligibleForSeed && <ClaimCta />}
      </StatusFrame>

      <RealmsCleared progress={progress} />
    </div>
  );
}

function ClaimCta() {
  const { claimSeed, isPending, error } = useClaimSeed();
  const [receipt, setReceipt] = useState<{
    txHash: `0x${string}`;
    realm: `0x${string}`;
  } | null>(null);

  if (receipt) {
    return (
      <p className="text-xs opacity-70 font-mono break-all">
        Mint sent · tx {receipt.txHash.slice(0, 10)}… via realm{" "}
        {receipt.realm.slice(0, 10)}…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <button
        type="button"
        disabled={isPending}
        onClick={async () => {
          try {
            const r = await claimSeed();
            setReceipt(r);
          } catch {
            /* surfaced via `error` below */
          }
        }}
        className="self-start rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-60"
        style={{
          background: "var(--color-preset-accent, #ffd97a)",
          color: "var(--color-preset-bg, #1a1410)",
        }}
      >
        {isPending ? "Submitting proof…" : "Claim Genesis Seed"}
      </button>
      {error && (
        <p className="text-xs" style={{ color: "#ffb38a" }}>
          {error.message}
        </p>
      )}
    </div>
  );
}

function RealmsCleared({ progress }: { progress: TutorialProgress }) {
  const remaining = (["fantasy", "scifi", "cyberpunk"] as const).filter(
    (p) => !progress.cleared.some((c) => c.preset === p),
  );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs uppercase tracking-widest opacity-60">
        Realms cleared
      </h3>
      <ul className="flex flex-col gap-2">
        {progress.cleared.length === 0 && (
          <li className="text-sm opacity-50">
            No clears yet — head to{" "}
            <Link href="/" className="underline opacity-90 hover:opacity-100">
              the picker
            </Link>{" "}
            to start a run.
          </li>
        )}
        {progress.cleared.map((c) => {
          const starter = getStarterRealm(c.preset);
          return (
            <li
              key={c.realm}
              className="flex items-baseline justify-between gap-3 rounded-md px-3 py-2"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium truncate">
                  {starter.name}
                </span>
                <span className="text-[11px] opacity-50">
                  {presetLabel(c.preset)} · cleared {relativeTime(c.ts)}
                </span>
              </div>
              <Link
                href={`/play/${c.preset}`}
                className="shrink-0 text-[11px] uppercase tracking-wider opacity-70 hover:opacity-100"
              >
                Re-run →
              </Link>
            </li>
          );
        })}
      </ul>

      {!progress.hasSeed && remaining.length > 0 && (
        <>
          <h3 className="mt-3 text-xs uppercase tracking-widest opacity-60">
            Still owed
          </h3>
          <ul className="flex flex-col gap-2">
            {remaining.map((p) => {
              const starter = getStarterRealm(p);
              return (
                <li
                  key={p}
                  className="flex items-baseline justify-between gap-3 rounded-md px-3 py-2"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px dashed rgba(255,255,255,0.12)",
                  }}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate opacity-80">
                      {starter.name}
                    </span>
                    <span className="text-[11px] opacity-50">
                      {presetLabel(p)} · not yet cleared
                    </span>
                  </div>
                  <Link
                    href={`/play/${p}`}
                    className="shrink-0 text-[11px] uppercase tracking-wider opacity-80 hover:opacity-100"
                  >
                    Enter →
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function ShardTrack({ shards }: { shards: number }) {
  return (
    <div
      aria-label={`Shards recovered: ${shards} of 3`}
      className="flex items-center gap-1.5"
    >
      {[0, 1, 2].map((i) => {
        const lit = i < shards;
        return (
          <span
            key={i}
            className="block"
            style={{
              width: 12,
              height: 12,
              transform: "rotate(45deg)",
              background: lit ? "#ffd97a" : "transparent",
              border: `1px solid ${lit ? "#ffd97a" : "rgba(255,255,255,0.25)"}`,
              boxShadow: lit ? "0 0 12px rgba(255,217,122,0.5)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}

function StatusFrame({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col gap-4 p-6 rounded-md"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </section>
  );
}

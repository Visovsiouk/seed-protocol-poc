"use client";

/**
 * `/realm/[address]` — per-realm dashboard.
 *
 * A single panel that explains what the URL address actually *is* on
 * this chain: starter realm, creator-deployed ecosystem, or unknown.
 * The three states have different play paths and different metadata
 * sources, so we lean on the pure `resolveRealmDetail` resolver to
 * pick the variant and then render in one place.
 *
 * Scope kept tight on purpose:
 *   - Read-only. No writes, no mints.
 *   - Surfaces the registry summary (owner, createdAt, active) plus
 *     the appropriate Play CTA.
 *   - Calls out wallet ownership when the connected account matches.
 *   - A "Recent clears" feed and per-realm leaderboard are flagged in
 *     `lib/reads/cache.ts` as `bossLeaderboard(realm)`, but adding the
 *     event scan is its own slice — out of scope here.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { RealmActivityFeed } from "@/components/realm/RealmActivityFeed";
import { MetricsRow } from "@/components/realm/MetricsRow";
import { BossLeaderboard } from "@/components/realm/BossLeaderboard";
import { useRealms } from "@/lib/reads/hooks";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { resolveRealmDetail, type RealmDetail } from "@/lib/contracts/realm-detail";

function shortAddress(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const colors =
    tone === "ok"
      ? { bg: "rgba(80,200,120,0.12)", fg: "#7ed99a", border: "rgba(80,200,120,0.35)" }
      : tone === "warn"
        ? { bg: "rgba(255,196,0,0.10)", fg: "#f0c860", border: "rgba(255,196,0,0.35)" }
        : { bg: "rgba(255,255,255,0.06)", fg: "rgba(255,255,255,0.55)", border: "rgba(255,255,255,0.1)" };
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
      style={{ background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }}
    >
      {label}
    </span>
  );
}

function KindPill({ detail }: { detail: RealmDetail }) {
  if (detail.kind === "starter") {
    const label =
      detail.preset === "fantasy"
        ? "Fantasy starter"
        : detail.preset === "scifi"
          ? "Sci-Fi starter"
          : "Cyberpunk starter";
    return <StatusPill label={label} tone="ok" />;
  }
  if (detail.kind === "creator") {
    return <StatusPill label="Creator realm" tone="muted" />;
  }
  return <StatusPill label="Unknown" tone="warn" />;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest opacity-50">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default function RealmDashboardPage() {
  const params = useParams<{ address: string }>();
  const raw = params.address ?? "";
  const validAddress = isHexAddress(raw);
  const address = validAddress ? (raw.toLowerCase() as `0x${string}`) : null;

  const { address: connected } = useAccount();
  const realms = useRealms();

  const detail = useMemo<RealmDetail | null>(() => {
    if (!address) return null;
    if (!realms.data) return null;
    return resolveRealmDetail({
      address,
      registry: realms.data,
      starters: listStarterRealms(),
    });
  }, [address, realms.data]);

  if (!validAddress) {
    return (
      <main className="min-h-screen px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="text-sm opacity-70 hover:opacity-100">
            ← Realms
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">Invalid address</h1>
          <p className="mt-2 text-sm opacity-80">
            <span className="font-mono">{raw}</span> isn&apos;t a valid
            ecosystem address.
          </p>
        </div>
      </main>
    );
  }

  const isOwner =
    detail && detail.kind !== "unknown" && !!connected &&
    detail.onchain.owner.toLowerCase() === connected.toLowerCase();

  const playHref =
    detail?.kind === "starter"
      ? `/play/${detail.preset}`
      : detail?.kind === "creator"
        ? `/play/realm/${detail.address}`
        : null;

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mx-auto mb-8 flex max-w-3xl items-center justify-between">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← Realms
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Realm</h1>
        <ConnectButton />
      </header>

      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        {realms.isLoading && !detail && (
          <p className="text-sm opacity-60">Loading realm…</p>
        )}

        {realms.isError && (
          <p className="text-sm" style={{ color: "#f77" }}>
            Failed to load the registry. Check the dev server logs.
          </p>
        )}

        {detail && (
          <article
            aria-label="Realm summary"
            className="flex flex-col gap-5 rounded-md p-5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <header className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">
                  {detail.kind === "starter"
                    ? detail.name
                    : detail.kind === "creator"
                      ? `Realm ${shortAddress(detail.address)}`
                      : "Unknown realm"}
                </h2>
                {detail.kind === "starter" && (
                  <p className="text-sm opacity-80 leading-relaxed">
                    {detail.tagline}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <KindPill detail={detail} />
                {detail.kind !== "unknown" && (
                  <StatusPill
                    label={detail.onchain.active ? "Active" : "Inactive"}
                    tone={detail.onchain.active ? "ok" : "warn"}
                  />
                )}
                {isOwner && <StatusPill label="You own this" tone="ok" />}
              </div>
            </header>

            {detail.kind === "unknown" ? (
              <p className="text-sm opacity-80">
                <span className="font-mono">{detail.address}</span> isn&apos;t
                registered in <code>EcosystemRegistry</code> on this chain.
                It may have been deployed against a different network, or
                the seed script hasn&apos;t run yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Address"
                  value={
                    <span className="font-mono break-all">
                      {detail.address}
                    </span>
                  }
                />
                <Field
                  label="Owner"
                  value={
                    <span className="font-mono">
                      {shortAddress(detail.onchain.owner)}
                    </span>
                  }
                />
                <Field
                  label="Registered at block"
                  value={
                    <span className="font-mono">
                      {detail.onchain.createdAt.toString()}
                    </span>
                  }
                />
                {detail.kind === "starter" && (
                  <Field
                    label="Boss"
                    value={<span className="font-mono">{detail.bossId}</span>}
                  />
                )}
              </div>
            )}

            {detail.kind === "creator" && (
              <aside
                aria-label="Creator realm note"
                className="rounded-md p-3 text-xs leading-relaxed"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                Creator-deployed ecosystems don&apos;t yet carry on-chain
                preset or boss metadata, so play runs in trial mode
                (fantasy flavor, no on-chain mints).
              </aside>
            )}

            {playHref && (
              <footer className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href={playHref}
                  className="rounded-md px-3 py-1.5 text-sm transition"
                  style={{
                    background: "var(--color-preset-bg, rgba(255,255,255,0.08))",
                    color: "var(--color-preset-fg, #fff)",
                    border:
                      "1px solid var(--color-preset-accent, rgba(255,255,255,0.18))",
                  }}
                >
                  {detail.kind === "starter" ? "Play →" : "Trial play →"}
                </Link>
                <Link
                  href="/bazaar"
                  className="text-sm opacity-80 hover:opacity-100"
                >
                  Bazaar
                </Link>
              </footer>
            )}
          </article>
        )}

        {detail && detail.kind !== "unknown" && (
          <>
            <MetricsRow
              realm={detail.address}
              preset={detail.kind === "starter" ? detail.preset : null}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              {detail.kind === "starter" && (
                <BossLeaderboard
                  realm={detail.address}
                  preset={detail.preset}
                />
              )}
              <RealmActivityFeed
                realm={detail.address}
                preset={detail.kind === "starter" ? detail.preset : null}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

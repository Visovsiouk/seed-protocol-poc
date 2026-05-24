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
 * Creator realms fetch their registered metadata (name, preset, bossId,
 * maxTier, lootSchemaId) from `/api/realm/[address]/meta` so the
 * dashboard shows real data instead of address-based placeholders.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { RealmActivityFeed } from "@/components/realm/RealmActivityFeed";
import { MetricsRow } from "@/components/realm/MetricsRow";
import { BossLeaderboard } from "@/components/realm/BossLeaderboard";
import { RealmAssetsGrid } from "@/components/realm/RealmAssetsGrid";
import { RoyaltyEarnedDemo } from "@/components/realm/RoyaltyEarnedDemo";
import { useRealms } from "@/lib/reads/hooks";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { resolveRealmDetail, type RealmDetail } from "@/lib/contracts/realm-detail";
import type { Preset } from "@/lib/engine/types";
import {
  LedgerBody,
  LedgerRule,
  LedgerStamp,
} from "@/components/ledger/Ledger";

type CreatorMeta = {
  address: `0x${string}`;
  owner: `0x${string}`;
  preset: Preset;
  bossId: string;
  name: string;
  maxTier: number;
  createdAt: number;
  lootSchemaId: string;
};

type MetaReply =
  | { ok: true; realm: CreatorMeta }
  | { ok: false; reason: string; message: string };

async function fetchCreatorMeta(address: `0x${string}`): Promise<CreatorMeta | null> {
  const res = await fetch(`/api/realm/${address}/meta`, { cache: "no-store" });
  if (res.status === 404) return null;
  const body = (await res.json()) as MetaReply;
  if (!body.ok) return null;
  return body.realm;
}

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

function KindPill({ detail, creatorMeta }: { detail: RealmDetail; creatorMeta: CreatorMeta | null }) {
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
    const preset = creatorMeta?.preset;
    const label = preset
      ? `Creator · ${preset === "scifi" ? "Sci-Fi" : preset.charAt(0).toUpperCase() + preset.slice(1)}`
      : "Creator realm";
    return <StatusPill label={label} tone="muted" />;
  }
  return <StatusPill label="Unknown" tone="warn" />;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span
        className="font-mono text-[10px] uppercase opacity-55"
        style={{ letterSpacing: "0.28em" }}
      >
        {label}
      </span>
      <span className="text-sm min-w-0">{value}</span>
    </div>
  );
}

function SetupStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px]"
        style={
          done
            ? { background: "rgba(80,200,120,0.18)", color: "#7ed99a", border: "1px solid rgba(80,200,120,0.4)" }
            : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", border: "1px dashed rgba(255,255,255,0.2)" }
        }
      >
        {done ? "✓" : "·"}
      </span>
      <span
        className="text-xs"
        style={{ color: done ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.38)" }}
      >
        {label}
      </span>
    </div>
  );
}

function SetupPending() {
  return (
    <aside
      aria-label="Setup incomplete"
      className="flex flex-col gap-4 rounded-md p-4"
      style={{
        background: "rgba(255,196,0,0.04)",
        border: "1px solid rgba(255,196,0,0.18)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-2 w-2 rounded-full"
            style={{ background: "#f0c860", boxShadow: "0 0 6px rgba(240,200,96,0.5)" }}
          />
          <span
            className="text-[10px] uppercase tracking-widest font-medium"
            style={{ color: "#f0c860" }}
          >
            Setup pending
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SetupStep done label="Deployed on-chain" />
        <SetupStep done={false} label="Preset, boss & name configured" />
        <SetupStep done={false} label="Minter delegate authorised" />
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
        This realm was deployed directly via the factory without going through
        the creation flow. Preset, boss, and the server-held minter delegate
        are not on record — loot and clear receipts cannot mint until setup
        is complete.
      </p>
    </aside>
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

  // Fetch sqlite metadata for creator realms. Starter realms have their
  // metadata hardcoded in starter-realms.ts; creator realms need this
  // to get name, preset, bossId, maxTier, and lootSchemaId.
  const metaQuery = useQuery({
    queryKey: ["realm-meta", address],
    enabled: !!address && detail?.kind === "creator",
    staleTime: Infinity,
    queryFn: async () => (address ? fetchCreatorMeta(address) : null),
  });
  const creatorMeta = metaQuery.data ?? null;

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

  // Resolved display values for creator realms.
  const creatorName = creatorMeta?.name ?? (address ? `Realm ${shortAddress(address)}` : "Unknown realm");
  const creatorPreset: Preset | null = creatorMeta?.preset ?? null;
  const lootSchemaId = creatorMeta?.lootSchemaId ? BigInt(creatorMeta.lootSchemaId) : undefined;

  // Effective preset for stats/leaderboard components — known for both
  // starter and registered creator realms.
  const effectivePreset: Preset | null =
    detail?.kind === "starter"
      ? detail.preset
      : creatorPreset;

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
            <header className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <LedgerStamp>
                  {detail.kind === "starter"
                    ? "Door · field record"
                    : detail.kind === "creator"
                      ? "Door · raised by another hand"
                      : "Door · unrecognized"}
                </LedgerStamp>
                <div className="flex items-center gap-2">
                  <KindPill detail={detail} creatorMeta={creatorMeta} />
                  {detail.kind !== "unknown" && (
                    <StatusPill
                      label={detail.onchain.active ? "Active" : "Inactive"}
                      tone={detail.onchain.active ? "ok" : "warn"}
                    />
                  )}
                  {isOwner && <StatusPill label="You own this" tone="ok" />}
                </div>
              </div>
              <LedgerRule />
              <h2
                className="font-mono text-2xl font-medium"
                style={{ letterSpacing: "-0.015em" }}
              >
                {detail.kind === "starter"
                  ? detail.name
                  : detail.kind === "creator"
                    ? creatorName
                    : "Unknown realm"}
              </h2>
              {detail.kind === "starter" && (
                <LedgerBody>{detail.tagline}</LedgerBody>
              )}
              <LedgerRule tone="muted" />
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
                {detail.kind === "creator" && creatorMeta && (
                  <>
                    <Field
                      label="Boss"
                      value={<span className="font-mono">{creatorMeta.bossId}</span>}
                    />
                    <Field
                      label="Max tier"
                      value={<span className="font-mono">T{creatorMeta.maxTier}</span>}
                    />
                  </>
                )}
              </div>
            )}

            {/* Unregistered creator realm — deployed on-chain but never
                went through /create, so no preset/boss/minter on record. */}
            {detail.kind === "creator" && metaQuery.isFetched && !creatorMeta && (
              <SetupPending />
            )}

            {/* Footer CTA — hidden for unregistered creator realms */}
            {playHref && (detail.kind !== "creator" || !!creatorMeta) && (
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
                  Play →
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

        {detail && detail.kind !== "unknown" && isOwner && (
          <RoyaltyEarnedDemo
            realm={detail.address}
            preset={effectivePreset ?? "fantasy"}
            realmLabel={
              detail.kind === "starter"
                ? detail.name
                : creatorName
            }
            lootSchemaId={lootSchemaId}
          />
        )}

        {detail && detail.kind !== "unknown" && (
          <>
            <MetricsRow
              realm={detail.address}
              preset={effectivePreset}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              {effectivePreset && (
                <BossLeaderboard
                  realm={detail.address}
                  preset={effectivePreset}
                />
              )}
              <RealmActivityFeed
                realm={detail.address}
                preset={effectivePreset}
              />
            </div>
            <RealmAssetsGrid
              realm={detail.address}
              preset={effectivePreset}
            />
          </>
        )}
      </section>
    </main>
  );
}

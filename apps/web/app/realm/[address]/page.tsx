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
import { RealmActivityFeed } from "@/components/realm/RealmActivityFeed";
import { MetricsRow } from "@/components/realm/MetricsRow";
import { BossLeaderboard } from "@/components/realm/BossLeaderboard";
import { RealmAssetsGrid } from "@/components/realm/RealmAssetsGrid";
import { RoyaltyEarnedDemo } from "@/components/realm/RoyaltyEarnedDemo";
import { useRealms } from "@/lib/reads/hooks";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import { resolveRealmDetail, type RealmDetail } from "@/lib/contracts/realm-detail";
import type { Preset } from "@/lib/engine/types";
import { AppShell, Panel, Button, Chip, Stamp, Rule } from "@/components/ui";
import { useRealmTheme } from "@/lib/ui/useRealmTheme";
import { shortAddress } from "@/lib/utils";
import { isHexAddress } from "@/lib/validation/schemas";

type CreatorMeta = {
  address: `0x${string}`;
  owner: `0x${string}`;
  preset: Preset;
  bossId: string;
  name: string;
  accent: string | null;
  maxTier: number;
  distinctClearers: number;
  nextTierAt: number | null;
  createdAt: number;
  lootSchemaId: string;
  clearReceiptSchemaId: string;
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

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const color =
    tone === "ok"
      ? "var(--color-ok)"
      : tone === "warn"
        ? "var(--color-warn)"
        : "var(--color-preset-fg)";
  return <Chip color={color} label={label} />;
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
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] opacity-65">
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
            ? {
                background: "color-mix(in oklab, var(--color-ok) 18%, transparent)",
                color: "var(--color-ok)",
                border: "1px solid color-mix(in oklab, var(--color-ok) 40%, transparent)",
              }
            : {
                background: "var(--surface-2)",
                color: "var(--color-preset-fg)",
                border: "1px dashed var(--border-2)",
              }
        }
      >
        {done ? "✓" : "·"}
      </span>
      <span className="text-xs" style={{ opacity: done ? 0.75 : 0.38 }}>
        {label}
      </span>
    </div>
  );
}

function SetupPending({ isOwner }: { isOwner: boolean }) {
  return (
    <Panel
      as="aside"
      tone="glass-1"
      aria-label="Setup incomplete"
      className="flex flex-col gap-4 p-4"
      style={{
        background: "color-mix(in oklab, var(--color-warn) 4%, transparent)",
        borderColor: "color-mix(in oklab, var(--color-warn) 18%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-2 w-2 rounded-full"
            style={{
              background: "var(--color-warn)",
              boxShadow: "0 0 6px color-mix(in oklab, var(--color-warn) 50%, transparent)",
            }}
          />
          <span className="text-[10px] uppercase tracking-widest font-medium text-[var(--color-warn)]">
            Setup pending
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SetupStep done label="Deployed on-chain" />
        <SetupStep done={false} label="Preset, boss & name configured" />
        <SetupStep done={false} label="Minter delegate authorised" />
      </div>

      <p className="text-xs leading-relaxed opacity-60">
        The founding rite never finished for this realm — the clone is live
        on-chain, but its schemas, boss, name, and server-held minter
        delegate are not on record. Loot and clear receipts cannot mint
        until setup is complete.
      </p>

      {isOwner ? (
        <Link href="/create" className="self-start">
          <Button intent="primary" size="sm">
            Finish the founding rite →
          </Button>
        </Link>
      ) : (
        <p className="text-xs opacity-50">
          Only the realm owner can finish setup — the create page resumes
          the rite for them.
        </p>
      )}
    </Panel>
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

  // Theme the dashboard to the realm it describes: genre palette for both
  // starter and creator realms, plus a creator's custom accent override.
  // Nullish preset (unknown realm) leaves the root default in place.
  const themePreset: Preset | null =
    detail?.kind === "starter"
      ? detail.preset
      : detail?.kind === "creator"
        ? creatorMeta?.preset ?? null
        : null;
  useRealmTheme(themePreset, creatorMeta?.accent ?? null);

  // Effective schema ids the stats/activity/asset readers classify against.
  // Starter realms use the seeded per-preset pair; creator realms register
  // their OWN pair on their clone (commit c90af90) and report it via meta.
  // Threading these explicitly fixes player-realm dashboards that otherwise
  // classified every mint against the wrong (seeded) preset ids.
  // NOTE: must stay above the early returns below — hooks can't be conditional.
  const { lootSchemaId, clearReceiptSchemaId } = useMemo<{
    lootSchemaId: bigint | undefined;
    clearReceiptSchemaId: bigint | undefined;
  }>(() => {
    if (detail?.kind === "starter") {
      const ids = getSeededSchemaIds(detail.preset);
      return { lootSchemaId: ids.loot, clearReceiptSchemaId: ids.clearReceipt };
    }
    return {
      lootSchemaId: creatorMeta?.lootSchemaId
        ? BigInt(creatorMeta.lootSchemaId)
        : undefined,
      clearReceiptSchemaId: creatorMeta?.clearReceiptSchemaId
        ? BigInt(creatorMeta.clearReceiptSchemaId)
        : undefined,
    };
  }, [detail, creatorMeta]);

  if (!validAddress) {
    return (
      <AppShell title="Realm" back={{ href: "/", label: "← Realms" }}>
        <Panel tone="glass-1" className="flex flex-col gap-2 p-5">
          <h2 className="text-2xl font-semibold">Invalid address</h2>
          <p className="text-sm opacity-80">
            <span className="font-mono">{raw}</span> isn&apos;t a valid
            ecosystem address.
          </p>
        </Panel>
      </AppShell>
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

  // Effective preset for stats/leaderboard components — known for both
  // starter and registered creator realms.
  const effectivePreset: Preset | null =
    detail?.kind === "starter"
      ? detail.preset
      : creatorPreset;

  const pageTitle =
    detail?.kind === "starter"
      ? detail.name
      : detail?.kind === "creator" && creatorMeta
        ? creatorName
        : "Realm";

  return (
    <AppShell title={pageTitle} back={{ href: "/", label: "← Realms" }}>
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        {realms.isLoading && !detail && (
          <p className="text-sm opacity-70">Loading realm…</p>
        )}

        {realms.isError && (
          <p className="text-sm text-[var(--color-danger)]">
            Failed to load the registry. Check the dev server logs.
          </p>
        )}

        {detail && (
          <Panel
            as="article"
            tone="glass-1"
            aria-label="Realm summary"
            className="flex flex-col gap-5 p-5"
          >
            <header className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Stamp>
                  {detail.kind === "starter"
                    ? "Door · field record"
                    : detail.kind === "creator"
                      ? "Door · raised by another hand"
                      : "Door · unrecognized"}
                </Stamp>
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
              <Rule />
              <h2 className="font-mono text-2xl font-medium tracking-[-0.015em]">
                {detail.kind === "starter"
                  ? detail.name
                  : detail.kind === "creator"
                    ? creatorName
                    : "Unknown realm"}
              </h2>
              {detail.kind === "starter" && (
                <p className="max-w-[62ch] font-mono italic leading-[1.75] opacity-85">
                  <span aria-hidden className="mr-[0.45em] opacity-50">
                    —
                  </span>
                  {detail.tagline}
                </p>
              )}
              <Rule tone="muted" />
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
                      label="Loot tier"
                      value={
                        <span className="font-mono">
                          T{creatorMeta.maxTier}
                          {creatorMeta.nextTierAt !== null ? (
                            <span className="opacity-65">
                              {" "}
                              · {creatorMeta.distinctClearers}/
                              {creatorMeta.nextTierAt} clearers to T
                              {creatorMeta.maxTier + 1}
                            </span>
                          ) : (
                            <span className="opacity-65"> · max</span>
                          )}
                        </span>
                      }
                    />
                  </>
                )}
              </div>
            )}

            {/* Unregistered creator realm — the clone exists on-chain but
                the founding rite never completed (interrupted mid-signing,
                or deployed straight against the factory), so no
                preset/boss/minter is on record. /create detects this state
                and resumes the remaining steps for the owner. */}
            {detail.kind === "creator" && metaQuery.isFetched && !creatorMeta && (
              <SetupPending isOwner={!!isOwner} />
            )}

            {/* Footer CTA — hidden for unregistered creator realms */}
            {playHref && (detail.kind !== "creator" || !!creatorMeta) && (
              <footer className="flex flex-wrap items-center gap-3 pt-1">
                <Link href={playHref}>
                  <Button intent="primary" size="sm">
                    Play →
                  </Button>
                </Link>
                <Link
                  href="/?station=market"
                  className="text-sm opacity-80 hover:opacity-100"
                >
                  Bazaar
                </Link>
              </footer>
            )}
          </Panel>
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
              lootSchemaId={lootSchemaId}
              clearReceiptSchemaId={clearReceiptSchemaId}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              {effectivePreset && (
                <BossLeaderboard
                  realm={detail.address}
                  preset={effectivePreset}
                  lootSchemaId={lootSchemaId}
                  clearReceiptSchemaId={clearReceiptSchemaId}
                />
              )}
              <RealmActivityFeed
                realm={detail.address}
                preset={effectivePreset}
                lootSchemaId={lootSchemaId}
                clearReceiptSchemaId={clearReceiptSchemaId}
              />
            </div>
            <RealmAssetsGrid
              realm={detail.address}
              preset={effectivePreset}
              clearReceiptSchemaId={clearReceiptSchemaId}
            />
          </>
        )}
      </section>
    </AppShell>
  );
}

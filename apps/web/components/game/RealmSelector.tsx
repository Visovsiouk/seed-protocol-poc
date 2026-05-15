"use client";

/**
 * Realm picker rendered on the landing page.
 *
 * Data flow:
 *   1. `useRealms()` reads `EcosystemRegistry.ecosystemList` for every
 *      registered ecosystem on the active chain.
 *   2. `buildRealmDisplay` (pure) joins those summaries with the
 *      per-preset starter metadata from `lib/contracts/starter-realms.ts`,
 *      producing a unified ordered list: starters first (in preset
 *      order), creator-deployed realms after.
 *   3. Each card renders the appropriate variant — starters link to
 *      `/play/[preset]` and surface ready/not-deployed/inactive state;
 *      creator realms render as address-tagged placeholders for now
 *      (no `/play/[address]` route exists yet for player-deployed
 *      ecosystems).
 *
 * "Realms are ecosystems" — there's no separate PoC `RealmRegistry`
 * contract; the protocol-level `EcosystemRegistry` is the source of
 * truth. Starter metadata (name, tagline, bossId) is purely a UI
 * overlay on top of those addresses.
 */

import Link from "next/link";
import { useMemo } from "react";
import type { Preset } from "@/lib/engine/types";
import { useRealms } from "@/lib/reads/hooks";
import {
  buildRealmDisplay,
  type RealmDisplay,
} from "@/lib/contracts/realm-display";
import { listStarterRealms } from "@/lib/contracts/starter-realms";

function PresetBadge({ preset }: { preset: Preset }) {
  const label =
    preset === "fantasy" ? "Fantasy" : preset === "scifi" ? "Sci-Fi" : "Cyberpunk";
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {label}
    </span>
  );
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

function shortAddress(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StarterCard({
  card,
}: {
  card: Extract<RealmDisplay, { kind: "starter" }>;
}) {
  const playable = card.deployed && card.ready;
  const status: { label: string; tone: "ok" | "warn" | "muted" } = !card.deployed
    ? { label: "Not yet seeded", tone: "muted" }
    : !card.onchain
      ? { label: "Pending registration", tone: "warn" }
      : !card.onchain.active
        ? { label: "Inactive", tone: "warn" }
        : { label: "Ready", tone: "ok" };

  const inner = (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{card.name}</h3>
        <PresetBadge preset={card.preset} />
      </header>
      <p className="text-sm opacity-80 leading-relaxed">{card.tagline}</p>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <StatusPill label={status.label} tone={status.tone} />
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-preset-accent)" }}
        >
          {playable ? "Enter →" : "—"}
        </span>
      </footer>
    </>
  );

  // Always keep the play link clickable even when the realm isn't ready —
  // the play route renders its own "not deployed" notice and the
  // disconnected-mode fallback still drives the in-memory engine, which
  // is the smoke-test surface devs use before seeding.
  return (
    <Link
      key={card.preset}
      href={`/play/${card.preset}`}
      data-preset={card.preset}
      className="flex flex-col gap-3 p-5 rounded-md transition hover:scale-[1.02] focus:outline-none focus:ring"
      style={{
        background: "var(--color-preset-bg)",
        color: "var(--color-preset-fg)",
        border: "1px solid var(--color-preset-accent)",
      }}
    >
      {inner}
    </Link>
  );
}

function CreatorCard({
  card,
}: {
  card: Extract<RealmDisplay, { kind: "creator" }>;
}) {
  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-md opacity-80"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.18)",
      }}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold font-mono">
          Realm {shortAddress(card.address)}
        </h3>
        <StatusPill label={card.active ? "Active" : "Inactive"} tone={card.active ? "ok" : "muted"} />
      </header>
      <p className="text-sm opacity-70 leading-relaxed">
        Creator-deployed ecosystem. Owner {shortAddress(card.owner)}. Browsing
        and play for non-starter realms lands in a later slice.
      </p>
      <p className="text-[11px] opacity-50 font-mono">
        Created at block {card.createdAt.toString()}
      </p>
    </div>
  );
}

/**
 * Optional `override` lets tests / Storybook bypass `useRealms()` with a
 * canned list. In production the prop is omitted and the hook drives.
 */
export function RealmSelector({ override }: { override?: readonly RealmDisplay[] } = {}) {
  const realms = useRealms();
  const display: readonly RealmDisplay[] = useMemo(() => {
    if (override) return override;
    return buildRealmDisplay({
      starters: listStarterRealms(),
      registry: realms.data ?? [],
    });
  }, [override, realms.data]);

  return (
    <section
      aria-label="Choose a realm"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-5xl"
    >
      {display.map((card) =>
        card.kind === "starter" ? (
          <StarterCard key={`starter:${card.preset}`} card={card} />
        ) : (
          <CreatorCard key={`creator:${card.address}`} card={card} />
        ),
      )}
      {realms.isLoading && display.length === 0 && (
        <p className="text-sm opacity-60">Loading realms…</p>
      )}
      {realms.isError && (
        <p className="text-sm" style={{ color: "#f77" }}>
          Failed to load realms from the registry. Check the dev server logs.
        </p>
      )}
    </section>
  );
}

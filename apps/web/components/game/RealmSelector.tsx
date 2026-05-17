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
import { useAccount } from "wagmi";
import type { Preset } from "@/lib/engine/types";
import { useRealms, useTutorialProgress } from "@/lib/reads/hooks";
import {
  buildRealmDisplay,
  type RealmDisplay,
} from "@/lib/contracts/realm-display";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { emptyTutorialProgress, type TutorialProgress } from "@/lib/tutorial/progress";
import {
  isPlayable,
  lockStateFor,
  lockTeaseFor,
  STORY_HERO_GENESIS,
  STORY_HERO_OPEN,
  type RealmLockState,
} from "@/lib/story/progression";

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
  lockState,
}: {
  card: Extract<RealmDisplay, { kind: "starter" }>;
  lockState: RealmLockState;
}) {
  const chainReady = card.deployed && card.ready;
  const playable = isPlayable(lockState);
  const cleared = lockState === "cleared";

  const status: { label: string; tone: "ok" | "warn" | "muted" } =
    lockState === "locked-pre-prev"
      ? { label: "Sealed", tone: "muted" }
      : cleared
        ? { label: "Cleared", tone: "ok" }
        : !card.deployed
          ? { label: "Not yet seeded", tone: "muted" }
          : !card.onchain
            ? { label: "Pending registration", tone: "warn" }
            : !card.onchain.active
              ? { label: "Inactive", tone: "warn" }
              : lockState === "genesis-locked"
                ? { label: "Genesis · begin here", tone: "ok" }
                : { label: "Ready", tone: "ok" };

  const tease = !playable ? lockTeaseFor(card.preset) : undefined;
  const cta = cleared ? "Re-enter →" : playable ? "Enter →" : "Sealed";

  const inner = (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{card.name}</h3>
        <PresetBadge preset={card.preset} />
      </header>
      <p className="text-sm opacity-80 leading-relaxed">
        {tease ?? card.tagline}
      </p>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <StatusPill label={status.label} tone={status.tone} />
        <span
          className="text-xs uppercase tracking-widest"
          style={{
            color: playable
              ? "var(--color-preset-accent)"
              : "rgba(255,255,255,0.35)",
          }}
        >
          {cta}
        </span>
      </footer>
    </>
  );

  const baseStyle = {
    background: "var(--color-preset-bg)",
    color: "var(--color-preset-fg)",
    border: "1px solid var(--color-preset-accent)",
  } as const;

  if (!playable) {
    return (
      <div
        key={card.preset}
        data-preset={card.preset}
        aria-disabled="true"
        className="flex flex-col gap-3 p-5 rounded-md opacity-50"
        style={{
          ...baseStyle,
          border: "1px dashed rgba(255,255,255,0.18)",
          filter: "grayscale(0.7)",
          cursor: "not-allowed",
        }}
      >
        {inner}
      </div>
    );
  }

  // Always keep the play link clickable even when the realm isn't yet
  // chain-ready — the play route renders its own "not deployed" notice
  // and the disconnected-mode fallback still drives the in-memory
  // engine, which is the smoke-test surface devs use before seeding.
  void chainReady;
  return (
    <Link
      key={card.preset}
      href={`/play/${card.preset}`}
      data-preset={card.preset}
      className="flex flex-col gap-3 p-5 rounded-md transition hover:scale-[1.02] focus:outline-none focus:ring"
      style={baseStyle}
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
  // Creator realms enter via /play/realm/[address] in trial mode —
  // see the route header for why we default flavor + bossId until
  // creators can stamp those on-chain via /create.
  return (
    <Link
      href={`/play/realm/${card.address}`}
      data-realm={card.address}
      className="flex flex-col gap-3 p-5 rounded-md transition hover:scale-[1.02] focus:outline-none focus:ring"
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
        Creator-deployed ecosystem. Owner {shortAddress(card.owner)}. Runs
        in trial mode (fantasy flavor, no on-chain mints) until the
        realm carries its own preset metadata.
      </p>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <p className="text-[11px] opacity-50 font-mono">
          Block {card.createdAt.toString()}
        </p>
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-preset-accent)" }}
        >
          Trial →
        </span>
      </footer>
    </Link>
  );
}

/**
 * Optional `override` lets tests / Storybook bypass `useRealms()` with a
 * canned list. In production the prop is omitted and the hook drives.
 */
export function RealmSelector({
  override,
  progressOverride,
}: {
  override?: readonly RealmDisplay[];
  /** Test/Storybook hook — bypasses `useTutorialProgress`. */
  progressOverride?: TutorialProgress;
} = {}) {
  const realms = useRealms();
  const { address } = useAccount();
  const tutorialQuery = useTutorialProgress(address);
  const progress: TutorialProgress =
    progressOverride ?? tutorialQuery.data ?? emptyTutorialProgress();

  const display: readonly RealmDisplay[] = useMemo(() => {
    if (override) return override;
    return buildRealmDisplay({
      starters: listStarterRealms(),
      registry: realms.data ?? [],
    });
  }, [override, realms.data]);

  const fantasyCleared = progress.cleared.some((c) => c.preset === "fantasy");
  // Pre-Genesis the picker collapses to a single door — every other
  // realm (starter or community) is hidden so the world feels narrow
  // and the player can't wander past the Reach.
  if (!fantasyCleared) {
    const fantasy = display.find(
      (c) => c.kind === "starter" && c.preset === "fantasy",
    ) as Extract<RealmDisplay, { kind: "starter" }> | undefined;
    return (
      <section
        aria-label="Genesis"
        className="flex flex-col gap-8 w-full max-w-3xl"
        data-preset="fantasy"
      >
        <GenesisHero />
        <div className="grid">
          {fantasy ? (
            <GenesisCard card={fantasy} />
          ) : realms.isLoading ? (
            <p className="text-sm opacity-60">Loading Genesis…</p>
          ) : (
            <p className="text-sm" style={{ color: "#f77" }}>
              Genesis realm config missing. Run <code>pnpm seed</code>.
            </p>
          )}
        </div>
        <p className="text-[11px] opacity-50 leading-relaxed max-w-prose">
          More doors will open once the Reach falls. Some of them were built
          by other players.
        </p>
      </section>
    );
  }

  // Post-Genesis: the open picker — starters + community realms. Cleared
  // realms still render (the player can re-enter), and any non-genesis
  // shard counts toward the Seed.
  return (
    <section
      aria-label="Choose a realm"
      className="flex flex-col gap-6 w-full max-w-5xl"
    >
      <OpenPickerHero progress={progress} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {display.map((card) =>
          card.kind === "starter" ? (
            <StarterCard
              key={`starter:${card.preset}`}
              card={card}
              lockState={lockStateFor(card.preset, progress)}
            />
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
      </div>
    </section>
  );
}

function GenesisHero() {
  return (
    <header className="flex flex-col gap-3 max-w-2xl">
      <span
        className="text-[11px] uppercase tracking-[0.3em] opacity-70"
        style={{ color: "var(--color-preset-accent)" }}
      >
        {STORY_HERO_GENESIS.eyebrow}
      </span>
      <h2 className="text-3xl font-semibold leading-tight">
        {STORY_HERO_GENESIS.title}
      </h2>
      <p className="text-base opacity-80 leading-relaxed">
        {STORY_HERO_GENESIS.body}
      </p>
    </header>
  );
}

function OpenPickerHero({ progress }: { progress: TutorialProgress }) {
  return (
    <header className="flex flex-col gap-2 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest opacity-60">
          {STORY_HERO_OPEN.eyebrow}
        </span>
        <ShardTrack shards={progress.distinctClears} />
      </div>
      <h2 className="text-xl font-semibold leading-snug">
        {STORY_HERO_OPEN.title}
      </h2>
      <p className="text-sm opacity-70 leading-relaxed">
        {STORY_HERO_OPEN.body}
      </p>
    </header>
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
            style={{
              width: 9,
              height: 9,
              transform: "rotate(45deg)",
              background: lit ? "var(--color-preset-accent)" : "transparent",
              border: `1px solid ${
                lit ? "var(--color-preset-accent)" : "rgba(255,255,255,0.25)"
              }`,
              boxShadow: lit ? "0 0 8px var(--color-preset-accent)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Cinematic Genesis card. Larger than a grid cell; uses preset
 * variables so the page can theme it via the body `data-preset`.
 */
function GenesisCard({
  card,
}: {
  card: Extract<RealmDisplay, { kind: "starter" }>;
}) {
  return (
    <Link
      href={`/play/${card.preset}`}
      data-preset={card.preset}
      className="group relative flex flex-col gap-4 p-8 rounded-lg overflow-hidden transition hover:scale-[1.01] focus:outline-none focus:ring"
      style={{
        background:
          "radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,0.10) 0%, var(--color-preset-bg) 60%)",
        color: "var(--color-preset-fg)",
        border: "1px solid var(--color-preset-accent)",
        boxShadow: "0 0 40px -20px var(--color-preset-accent)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-30 transition group-hover:opacity-50"
        style={{
          background:
            "repeating-linear-gradient(115deg, transparent 0 18px, rgba(255,255,255,0.04) 18px 19px)",
        }}
      />
      <div className="relative flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-3">
          <h3 className="text-2xl font-semibold tracking-tight">
            {card.name}
          </h3>
          <span
            className="text-[10px] uppercase tracking-[0.25em] opacity-70"
            style={{ color: "var(--color-preset-accent)" }}
          >
            Genesis
          </span>
        </header>
        <p className="text-sm opacity-85 leading-relaxed max-w-prose">
          {card.tagline}
        </p>
        <footer className="flex items-center justify-between pt-2">
          <span className="text-[11px] uppercase tracking-widest opacity-60">
            Six rooms. One Hag. One first step.
          </span>
          <span
            className="text-sm uppercase tracking-widest font-medium"
            style={{ color: "var(--color-preset-accent)" }}
          >
            Walk in →
          </span>
        </footer>
      </div>
    </Link>
  );
}

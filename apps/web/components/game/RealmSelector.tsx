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
 *      creator realms link to `/play/realm/[address]` with registered
 *      metadata (name, preset, boss) when available, or trial mode
 *      otherwise.
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
import {
  useRealms,
  useTutorialProgress,
  usePlayerRealms,
  type PlayerRealmMeta,
} from "@/lib/reads/hooks";
import {
  buildRealmDisplay,
  type RealmDisplay,
} from "@/lib/contracts/realm-display";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { emptyTutorialProgress, type TutorialProgress } from "@/lib/tutorial/progress";
import {
  isPlayable,
  lockStateFor,
  REALM_ORDER,
  STORY_HERO_OPEN,
  type RealmLockState,
} from "@/lib/story/progression";
import { Chip, Body, Rule, Stamp } from "@/components/ui";

/**
 * What a realm card hands back when it's wired for selection (the
 * pocket-realm hub passes `onSelectRealm` so cards stage a loadout
 * instead of navigating straight into the run).
 */
export type RealmSelection =
  | { kind: "starter"; preset: Preset }
  | { kind: "creator"; address: `0x${string}` };

function PresetBadge({ preset }: { preset: Preset }) {
  const label =
    preset === "fantasy" ? "Fantasy" : preset === "scifi" ? "Sci-Fi" : "Cyberpunk";
  return (
    <span className="inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-1)]">
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
  const color =
    tone === "ok"
      ? "var(--color-ok)"
      : tone === "warn"
        ? "var(--color-warn)"
        : "var(--color-preset-fg)";
  return <Chip color={color} label={label} />;
}

function shortAddress(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StarterCard({
  card,
  lockState,
  onSelect,
}: {
  card: Extract<RealmDisplay, { kind: "starter" }>;
  lockState: RealmLockState;
  /**
   * When provided, the card stages a loadout (calls `onSelect`) instead
   * of navigating straight to `/play/[preset]`. The hub wires this; other
   * mounts (tests) omit it and keep the link behaviour.
   */
  onSelect?: () => void;
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

  const cta = cleared ? "Re-enter →" : "Enter →";

  const inner = (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-lg font-medium tracking-[-0.01em]">
          {card.name}
        </h3>
        <PresetBadge preset={card.preset} />
      </header>
      <Body size="sm">{card.tagline}</Body>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <StatusPill label={status.label} tone={status.tone} />
        <span
          className="font-mono text-xs uppercase tracking-[0.22em]"
          style={{ color: "var(--color-preset-accent)" }}
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
    // A realm the player hasn't reached yet sits in the base as an
    // anonymous seal — no name, no genre, no colour, nothing to give the
    // surprise away. (Starters are only ever !playable pre-arc; once the
    // arc is done all three read as "cleared".)
    return (
      <div
        aria-disabled="true"
        aria-label="Sealed realm"
        className="flex flex-col gap-3 p-5 rounded-md opacity-60"
        style={{
          background: "var(--surface-1)",
          border: "1px dashed var(--border-2)",
          cursor: "not-allowed",
        }}
      >
        <header className="flex items-baseline justify-between gap-2">
          <Stamp>Sealed</Stamp>
        </header>
        <Body size="sm">
          A way down you haven&apos;t earned the breaking of.
        </Body>
        <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
          <StatusPill label="Sealed" tone="muted" />
          <span className="font-mono text-xs uppercase tracking-[0.22em] opacity-30">
            ?????
          </span>
        </footer>
      </div>
    );
  }

  // Always keep the play link clickable even when the realm isn't yet
  // chain-ready — the play route renders its own "not deployed" notice
  // and the disconnected-mode fallback still drives the in-memory
  // engine, which is the smoke-test surface devs use before seeding.
  void chainReady;
  const cardClass =
    "flex flex-col gap-3 p-5 rounded-md text-left transition hover:scale-[1.02] focus:outline-none focus:ring";
  if (onSelect) {
    return (
      <button
        key={card.preset}
        type="button"
        onClick={onSelect}
        data-preset={card.preset}
        className={cardClass}
        style={baseStyle}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link
      key={card.preset}
      href={`/play/${card.preset}`}
      data-preset={card.preset}
      className={cardClass}
      style={baseStyle}
    >
      {inner}
    </Link>
  );
}

function CreatorCard({
  card,
  meta,
  onSelect,
}: {
  card: Extract<RealmDisplay, { kind: "creator" }>;
  /** Sqlite metadata when the realm was registered via /create
   *. Absent for legacy realms — those still render with
   *  the trial-mode copy and an address-based title. */
  meta?: PlayerRealmMeta;
  /** When provided, stage a loadout instead of navigating to play. */
  onSelect?: () => void;
}) {
  const isRegistered = !!meta;
  const title = meta?.name ?? `Realm ${shortAddress(card.address)}`;
  // Preset-themed palette when registered, neutral dashed border for
  // trial-mode (legacy) realms so the visual hierarchy still tells
  // them apart at a glance.
  // A custom accent is scoped to this card via an inline CSS-var override;
  // because the link carries `data-preset`, the genre block resolves the
  // rest of the palette and the override just recolours the accent.
  const accentOverride = meta?.accent
    ? ({ "--color-preset-accent": meta.accent } as React.CSSProperties)
    : undefined;
  const style: React.CSSProperties = isRegistered
    ? {
        background: "var(--color-preset-bg)",
        color: "var(--color-preset-fg)",
        border: "1px solid var(--color-preset-accent)",
        ...accentOverride,
      }
    : {
        background: "var(--surface-1)",
        border: "1px dashed var(--border-2)",
      };

  const inner = (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <h3
          className={
            isRegistered
              ? "text-lg font-semibold"
              : "text-base font-semibold font-mono"
          }
        >
          {title}
        </h3>
        {isRegistered ? (
          <PresetBadge preset={meta.preset} />
        ) : (
          <StatusPill
            label={card.active ? "Active" : "Inactive"}
            tone={card.active ? "ok" : "muted"}
          />
        )}
      </header>
      <p className="text-sm opacity-75 leading-relaxed">
        {isRegistered ? (
          <>
            Creator realm · final boss <code>{meta.bossId}</code> · max
            tier <strong>T{meta.maxTier}</strong>. Owner{" "}
            <span className="font-mono">{shortAddress(card.owner)}</span>.
          </>
        ) : (
          <>
            Creator-deployed ecosystem. Owner{" "}
            <span className="font-mono">{shortAddress(card.owner)}</span>.
            Runs in trial mode until the realm is registered via
            <code> /create</code>.
          </>
        )}
      </p>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <p className="text-[11px] opacity-65 font-mono">
          Block {card.createdAt.toString()}
        </p>
        <span
          className="text-xs uppercase tracking-widest"
          style={{
            color: isRegistered
              ? "var(--color-preset-accent)"
              : "var(--color-preset-fg)",
            opacity: isRegistered ? 1 : 0.55,
          }}
        >
          {isRegistered ? "Enter →" : "Trial →"}
        </span>
      </footer>
    </>
  );

  const cardClass =
    "flex flex-col gap-3 p-5 rounded-md text-left transition hover:scale-[1.02] focus:outline-none focus:ring";
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        data-realm={card.address}
        data-preset={meta?.preset}
        className={cardClass}
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link
      href={`/play/realm/${card.address}`}
      data-realm={card.address}
      data-preset={meta?.preset}
      className={cardClass}
      style={style}
    >
      {inner}
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
  playerRealmsOverride,
  onSelectRealm,
}: {
  override?: readonly RealmDisplay[];
  /** Test/Storybook hook — bypasses `useTutorialProgress`. */
  progressOverride?: TutorialProgress;
  /** Test/Storybook hook — bypasses `usePlayerRealms`. */
  playerRealmsOverride?: ReadonlyMap<string, PlayerRealmMeta>;
  /**
   * When provided (the pocket-realm hub does), realm cards call this with
   * the chosen realm to stage a loadout instead of navigating into the
   * run. Omitted elsewhere — cards then link straight to the play route.
   */
  onSelectRealm?: (sel: RealmSelection) => void;
} = {}) {
  const realms = useRealms();
  const { address } = useAccount();
  const tutorialQuery = useTutorialProgress(address);
  const playerRealms = usePlayerRealms();
  const progress: TutorialProgress =
    progressOverride ?? tutorialQuery.data ?? emptyTutorialProgress();
  const playerRealmMap: ReadonlyMap<string, PlayerRealmMeta> =
    playerRealmsOverride ?? playerRealms.data ?? new Map();

  const display: readonly RealmDisplay[] = useMemo(() => {
    if (override) return override;
    return buildRealmDisplay({
      starters: listStarterRealms(),
      registry: realms.data ?? [],
    });
  }, [override, realms.data]);

  // Pre-arc: the three starter realms are laid out exactly as the open
  // picker shows them, but the ones the player hasn't reached yet are
  // sealed — present, disabled, and unnamed, so the surprise survives.
  // Community realms stay off-screen until the arc is done. The player
  // picks the open realm and descends; no forced single-step walk.
  if (progress.starterClears < REALM_ORDER.length) {
    return (
      <PreArcBase
        progress={progress}
        starters={display}
        onSelectRealm={onSelectRealm}
      />
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
              onSelect={
                onSelectRealm
                  ? () => onSelectRealm({ kind: "starter", preset: card.preset })
                  : undefined
              }
            />
          ) : (
            <CreatorCard
              key={`creator:${card.address}`}
              card={card}
              meta={playerRealmMap.get(card.address.toLowerCase())}
              onSelect={
                onSelectRealm
                  ? () =>
                      onSelectRealm({ kind: "creator", address: card.address })
                  : undefined
              }
            />
          ),
        )}
        {realms.isLoading && display.length === 0 && (
          <p className="text-sm opacity-70">Loading realms…</p>
        )}
        {realms.isError && (
          <p className="text-sm text-[var(--color-danger)]">
            Failed to load realms from the registry. Check the dev server logs.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Pre-arc base: the player has woken into the hideout (the cold-open Book
 * is owned by the hub, upstream of this). The three starter realms are
 * laid out like the open picker, but only the realms the player has
 * reached are named and enterable — the rest sit as anonymous seals. No
 * community realms, no protocol vocabulary, no forced single-step walk:
 * the player picks the open realm and descends.
 */
function PreArcBase({
  progress,
  starters,
  onSelectRealm,
}: {
  progress: TutorialProgress;
  starters: readonly RealmDisplay[];
  onSelectRealm?: (sel: RealmSelection) => void;
}) {
  const starterCards = starters
    .filter(
      (c): c is Extract<RealmDisplay, { kind: "starter" }> =>
        c.kind === "starter",
    )
    .slice()
    .sort(
      (a, b) =>
        REALM_ORDER.indexOf(a.preset) - REALM_ORDER.indexOf(b.preset),
    );
  const first = progress.starterClears === 0;
  return (
    <section
      aria-label="The base"
      className="flex flex-col gap-6 w-full max-w-5xl"
    >
      <header className="flex flex-col gap-4 max-w-2xl">
        <Rule />
        <Stamp>{first ? "The base" : "Between descents"}</Stamp>
        <h2 className="font-mono text-xl leading-snug font-medium tracking-[-0.015em]">
          {first
            ? "Still air, and the realms below."
            : "Back in the hush between realms."}
        </h2>
        <Body size="sm">
          {first
            ? "The book set you down here — a room that holds its breath in the gap between realms, the one place the ground beneath you has forgotten how to count. Three ways down wait along the wall, but only the nearest will open for you; the rest keep their names until you've earned the breaking of their seals. Choose your descent."
            : "The room still holds its breath. Another seal has given way since you last passed through — the rest keep their names a while longer. Choose your descent."}
        </Body>
        <Rule tone="muted" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {starterCards.map((card) => (
          <StarterCard
            key={`starter:${card.preset}`}
            card={card}
            lockState={lockStateFor(card.preset, progress)}
            onSelect={
              onSelectRealm
                ? () => onSelectRealm({ kind: "starter", preset: card.preset })
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function OpenPickerHero({ progress }: { progress: TutorialProgress }) {
  return (
    <header className="flex flex-col gap-4 max-w-3xl">
      <Rule />
      <div className="flex items-center justify-between gap-3">
        <Stamp>{STORY_HERO_OPEN.eyebrow}</Stamp>
        <ShardTrack shards={progress.distinctClears} />
      </div>
      <h2 className="font-mono text-xl leading-snug font-medium tracking-[-0.01em]">
        {STORY_HERO_OPEN.title}
      </h2>
      <Body size="sm">{STORY_HERO_OPEN.body}</Body>
      <Rule tone="muted" />
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
                lit ? "var(--color-preset-accent)" : "var(--border-2)"
              }`,
              boxShadow: lit ? "0 0 8px var(--color-preset-accent)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}


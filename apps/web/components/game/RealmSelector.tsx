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
import { useEffect, useMemo, useState } from "react";
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
  lockTeaseFor,
  nextStarterFor,
  REALM_ORDER,
  STORY_HERO_OPEN,
  type RealmLockState,
} from "@/lib/story/progression";
import {
  LedgerBody,
  LedgerRule,
  LedgerStamp,
} from "@/components/ledger/Ledger";
import { ColdOpenBook, hasConsumedColdOpen } from "@/components/story/ColdOpenBook";

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
        <h3
          className="font-mono text-lg font-medium"
          style={{ letterSpacing: "-0.01em" }}
        >
          {card.name}
        </h3>
        <PresetBadge preset={card.preset} />
      </header>
      {tease ? (
        <div className="flex flex-col gap-2">
          <LedgerStamp>Sealed · note left on the door</LedgerStamp>
          <LedgerRule tone="muted" />
          <LedgerBody size="sm">{tease}</LedgerBody>
        </div>
      ) : (
        <LedgerBody size="sm">{card.tagline}</LedgerBody>
      )}
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <StatusPill label={status.label} tone={status.tone} />
        <span
          className="font-mono text-xs uppercase"
          style={{
            letterSpacing: "0.22em",
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
  meta,
}: {
  card: Extract<RealmDisplay, { kind: "creator" }>;
  /** Sqlite metadata when the realm was registered via /create
   *. Absent for legacy realms — those still render with
   *  the trial-mode copy and an address-based title. */
  meta?: PlayerRealmMeta;
}) {
  const isRegistered = !!meta;
  const title = meta?.name ?? `Realm ${shortAddress(card.address)}`;
  // Preset-themed palette when registered, neutral dashed border for
  // trial-mode (legacy) realms so the visual hierarchy still tells
  // them apart at a glance.
  const style = isRegistered
    ? ({
        background: "var(--color-preset-bg)",
        color: "var(--color-preset-fg)",
        border: "1px solid var(--color-preset-accent)",
      } as const)
    : ({
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.18)",
      } as const);

  return (
    <Link
      href={`/play/realm/${card.address}`}
      data-realm={card.address}
      data-preset={meta?.preset}
      className="flex flex-col gap-3 p-5 rounded-md transition hover:scale-[1.02] focus:outline-none focus:ring"
      style={style}
    >
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
        <p className="text-[11px] opacity-50 font-mono">
          Block {card.createdAt.toString()}
        </p>
        <span
          className="text-xs uppercase tracking-widest"
          style={{
            color: isRegistered
              ? "var(--color-preset-accent)"
              : "rgba(255,255,255,0.55)",
          }}
        >
          {isRegistered ? "Enter →" : "Trial →"}
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
  playerRealmsOverride,
}: {
  override?: readonly RealmDisplay[];
  /** Test/Storybook hook — bypasses `useTutorialProgress`. */
  progressOverride?: TutorialProgress;
  /** Test/Storybook hook — bypasses `usePlayerRealms`. */
  playerRealmsOverride?: ReadonlyMap<string, PlayerRealmMeta>;
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

  // Pre-3-clear the picker is replaced by the forced linear walk: the
  // cold-open Book on first arrival, then a single Continue card that
  // points the player at whichever starter is up next. No other realms
  // (starter or community) are visible — the world is meant to feel
  // narrow, and the protocol nouns stay off-screen.
  if (progress.starterClears < REALM_ORDER.length) {
    return (
      <PreArcLanding
        progress={progress}
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
            />
          ) : (
            <CreatorCard
              key={`creator:${card.address}`}
              card={card}
              meta={playerRealmMap.get(card.address.toLowerCase())}
            />
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

/**
 * Pre-arc landing: cold open on first arrival, then a single Continue
 * card for the next starter in `REALM_ORDER`. Renders no other realms
 * and uses no protocol vocabulary.
 *
 * The cold-open flag is read from localStorage; we mirror it into
 * state on mount so the SSR pass + first client render don't disagree
 * about which branch to show.
 */
function PreArcLanding({ progress }: { progress: TutorialProgress }) {
  const [showBook, setShowBook] = useState<boolean | null>(null);
  useEffect(() => {
    // Only ever show the Book on the player's very first arrival
    // (zero starters cleared, no consumed flag). Once they've stepped
    // through it we never want it to re-appear, even between realms.
    if (progress.starterClears === 0 && !hasConsumedColdOpen()) {
      setShowBook(true);
    } else {
      setShowBook(false);
    }
  }, [progress.starterClears]);

  // Stable shape during the pre-mount pass — avoids a flash of the
  // Continue card on first paint when the Book is about to show.
  if (showBook === null) {
    return (
      <section
        aria-label="Loading"
        className="flex flex-col gap-6 w-full max-w-2xl"
      />
    );
  }

  if (showBook) {
    return (
      <section
        aria-label="Cold open"
        className="flex flex-col gap-6 w-full max-w-2xl"
        data-preset="fantasy"
      >
        <ColdOpenBook wakeHref="/play/fantasy" />
      </section>
    );
  }

  // Returning visitor with the cold open consumed but the arc not yet
  // finished — show a single Continue card to whichever starter is up
  // next. Realm names stay generic so the next-door surprise survives.
  const nextPreset = nextStarterFor(progress.starterClears);
  const stepLabel = ["Door I", "Door II", "Door III"][progress.starterClears] ?? "The next door";
  return (
    <section
      aria-label="Continue"
      className="flex flex-col gap-6 w-full max-w-2xl"
      data-preset={nextPreset ?? "fantasy"}
    >
      <header className="flex flex-col gap-4 max-w-2xl">
        <LedgerRule />
        <LedgerStamp>Field record · the walk continues</LedgerStamp>
        <h2
          className="font-mono text-xl leading-snug font-medium"
          style={{ letterSpacing: "-0.015em" }}
        >
          {progress.starterClears === 0
            ? "You wake in mud."
            : "The ground is different. The mark on your hand is the same."}
        </h2>
        <LedgerBody size="sm">
          {progress.starterClears === 0
            ? "Walk forward. The ground here remembers you."
            : "Keep walking. There are more doors. The protocol is still counting."}
        </LedgerBody>
        <LedgerRule tone="muted" />
      </header>

      {nextPreset ? (
        <Link
          href={`/play/${nextPreset}`}
          data-preset={nextPreset}
          className="group flex flex-col gap-3 p-6 rounded-md transition hover:scale-[1.01] focus:outline-none focus:ring"
          style={{
            background: "var(--color-preset-bg)",
            color: "var(--color-preset-fg)",
            border: "1px solid var(--color-preset-accent)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <LedgerStamp>{stepLabel}</LedgerStamp>
            <span
              className="font-mono text-xs uppercase"
              style={{
                letterSpacing: "0.22em",
                color: "var(--color-preset-accent)",
              }}
            >
              Walk in →
            </span>
          </div>
        </Link>
      ) : (
        <p className="text-sm opacity-60">No further door is open yet.</p>
      )}
    </section>
  );
}

function OpenPickerHero({ progress }: { progress: TutorialProgress }) {
  return (
    <header className="flex flex-col gap-4 max-w-3xl">
      <LedgerRule />
      <div className="flex items-center justify-between gap-3">
        <LedgerStamp>{STORY_HERO_OPEN.eyebrow}</LedgerStamp>
        <ShardTrack shards={progress.distinctClears} />
      </div>
      <h2
        className="font-mono text-xl leading-snug font-medium"
        style={{ letterSpacing: "-0.01em" }}
      >
        {STORY_HERO_OPEN.title}
      </h2>
      <LedgerBody size="sm">{STORY_HERO_OPEN.body}</LedgerBody>
      <LedgerRule tone="muted" />
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


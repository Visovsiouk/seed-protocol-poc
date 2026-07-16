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
} from "@/lib/story/progression";
import { Body, Rule, Stamp } from "@/components/ui";
import { CreatorCard } from "./realm-cards/CreatorCard";
import { RealmGrid, type RealmCell } from "./realm-cards/RealmGrid";
import { StarterCard } from "./realm-cards/StarterCard";

/**
 * What a realm card hands back when it's wired for selection (the
 * pocket-realm hub passes `onSelectRealm` so cards stage a loadout
 * instead of navigating straight into the run).
 */
export type RealmSelection =
  | { kind: "starter"; preset: Preset }
  | { kind: "creator"; address: `0x${string}` };

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

  // Post-Genesis: the open picker. Once any player-made realm is
  // registered, the picker shows *only* player-made realms — the three
  // premade starters are the same for every player and have nothing left
  // to offer here (all cleared by this point, per the arc-completion
  // gate above). With no player realms yet, the starters still carry the
  // picker exactly as before.
  const starterCards = display.filter(
    (c): c is Extract<RealmDisplay, { kind: "starter" }> => c.kind === "starter",
  );
  const creatorCards = display.filter(
    (c): c is Extract<RealmDisplay, { kind: "creator" }> => c.kind === "creator",
  );
  const showCreators = creatorCards.length > 0;

  const starterCells: RealmCell[] = starterCards.map((card) => ({
    key: `starter:${card.preset}`,
    enabled: isPlayable(lockStateFor(card.preset, progress)),
    render: ({ cellRef, tabIndex }) => (
      <StarterCard
        card={card}
        lockState={lockStateFor(card.preset, progress)}
        cellRef={cellRef}
        tabIndex={tabIndex}
        onSelect={
          onSelectRealm
            ? () => onSelectRealm({ kind: "starter", preset: card.preset })
            : undefined
        }
      />
    ),
  }));

  const creatorCells: RealmCell[] = creatorCards.map((card) => ({
    key: `creator:${card.address}`,
    enabled: true,
    render: ({ cellRef, tabIndex }) => (
      <CreatorCard
        card={card}
        meta={playerRealmMap.get(card.address.toLowerCase())}
        cellRef={cellRef}
        tabIndex={tabIndex}
        onSelect={
          onSelectRealm
            ? () => onSelectRealm({ kind: "creator", address: card.address })
            : undefined
        }
      />
    ),
  }));

  return (
    <section
      aria-label="Choose a realm"
      className="flex flex-col gap-6 w-full max-w-5xl"
    >
      <OpenPickerHero progress={progress} />
      {showCreators ? (
        <div className="flex flex-col gap-3">
          <Stamp>Player-made realms</Stamp>
          <RealmGrid cells={creatorCells} />
        </div>
      ) : (
        <RealmGrid cells={starterCells} />
      )}
      {realms.isLoading && display.length === 0 && (
        <p className="text-sm opacity-70">Loading realms…</p>
      )}
      {realms.isError && (
        <p className="text-sm text-[var(--color-danger)]">
          Failed to load realms from the registry. Check the dev server logs.
        </p>
      )}
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
      <header className="flex flex-col gap-4">
        <Rule />
        <Stamp>{first ? "The base" : "Between descents"}</Stamp>
        <h2 className="font-mono text-xl leading-snug font-medium tracking-[-0.015em]">
          {first
            ? "You land on your feet in a room that wasn't there."
            : "Back in the hush between realms."}
        </h2>
        <Body size="sm">
          {first
            ? "The fall just stops, and the floor is under you — a small bare room at the foot of the worlds, drawn close as a held breath. This is where a mortal stands between descents to weigh what they're becoming: a maker who will carry themselves back up and carve a name, or one more the worlds set into themselves as a guardian. The brand on your hand has gone quiet here — not cold, only waiting; it is half a name, and it knows it. It does its counting below, never in this room. Three ways down lead off the walls, one to each unfinished world. Two are sealed flat — no seam, no handle, no name — and stay that way until you've gone deep enough to earn the breaking of them. The nearest already stands open. Go down."
            : "The room draws close around you again, quiet as a held breath, and the brand warms the moment you turn to the wall — it remembers what it counted last time. One more seal has given way since you passed through; the rest keep their worlds a while longer. Go down."}
        </Body>
        <Rule tone="muted" />
      </header>

      <RealmGrid
        cells={starterCards.map((card): RealmCell => ({
          key: `starter:${card.preset}`,
          enabled: isPlayable(lockStateFor(card.preset, progress)),
          render: ({ cellRef, tabIndex }) => (
            <StarterCard
              card={card}
              lockState={lockStateFor(card.preset, progress)}
              cellRef={cellRef}
              tabIndex={tabIndex}
              onSelect={
                onSelectRealm
                  ? () =>
                      onSelectRealm({ kind: "starter", preset: card.preset })
                  : undefined
              }
            />
          ),
        }))}
      />
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
      aria-label={`Sparks kindled: ${shards} of 3`}
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


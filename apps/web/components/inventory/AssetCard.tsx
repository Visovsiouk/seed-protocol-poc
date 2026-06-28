"use client";

/**
 * Generic asset card — renders any `AssetCard` from the engine, regardless
 * of source realm or schema. Used inside the inventory drawer and (Phase
 * 4) the Bazaar listing detail.
 *
 * The card surfaces three layers, top to bottom:
 *   1. Identity — name, realm of origin (the `mintedBy` realm), tier.
 *   2. Canonical mechanical stats from the tier table.
 *   3. Catalog effects (if any) and extra non-canonical fields.
 *
 * Presentation is built entirely on the shared kit:
 * a tier-ramp spine down the left edge keyed to `tierColor`, kit chips for
 * tier / element / effect / provenance, and token-ized surfaces — no inline
 * colour dicts. `selected` is presentational only — equip flow is driven by
 * the parent (`<InventoryDrawer/>`).
 */

import type {
  AssetCard as AssetCardType,
  Element,
  Preset,
} from "@/lib/engine/types";
import {
  presetForRealm,
  useElementLabel,
  useTranslatedCard,
} from "@/lib/contracts/adapters";
import { getAdapterAddress } from "@/lib/contracts/seeded-adapters";
import { armorName, weaponName } from "@/lib/loot/names";
import { cardDisplayName } from "@/lib/loot/card-name";
import { tierColor } from "@/lib/ui/loot-visuals";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";
import { ElementChip, EffectChip, ProvenanceChip } from "@/components/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

type Props = {
  card: AssetCardType;
  selected?: boolean;
  onClick?: () => void;
  /** Compact mode strips the description and shortens the card. */
  compact?: boolean;
  /**
   * The realm the player is currently playing in. When set and different
   * from `card.realm`, the card renders a translation strip showing the
   * stats the adapter will produce on equip. Omit on screens where there
   * is no "active realm" context (e.g. the Bazaar listing detail).
   */
  targetRealm?: `0x${string}`;
  /**
   * Optional preset hint for `targetRealm`. Required when the target is a
   * player-deployed realm not in the seeded-realms map. The play page
   * supplies this from its realm-meta fetch so translation works uniformly
   * across starter and player-made realms.
   */
  targetPreset?: Preset;
  /**
   * Hide the "Translated from …" original-stats strip. Used by the
   * Gear Translation pair, where the native card is already shown
   * side-by-side, so the strip would just duplicate it.
   */
  hideOriginal?: boolean;
};

/**
 * Element pill that resolves the preset-local vocabulary (e.g. holy →
 * "laser" in cyberpunk) and delegates to the kit `ElementChip` so the hue
 * stays canonical while the label follows the realm. `null` preset falls
 * back to the canonical name.
 */
function TranslatedElementChip({
  element,
  kind,
  preset,
}: {
  element: Exclude<Element, "none">;
  kind: "damage" | "resist";
  preset: Preset | null;
}) {
  const label = useElementLabel(element, preset);
  return <ElementChip element={element} label={label} kind={kind} />;
}

function shortAddr(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Resolve the schema-native TYPE label for a card under a given preset's
 * vocabulary. Returns "" when the card has no archetype (story-objects,
 * legacy un-archetyped loot) or when the preset can't be resolved — in
 * either case the chip is omitted by the caller.
 */
function typeLabelFor(
  card: AssetCardType,
  preset: Preset | null,
): string {
  if (!preset) return "";
  if (card.slot === "weapon") {
    return weaponName(preset, card.weaponType, card.tier);
  }
  if (card.slot === "armor") {
    return armorName(preset, card.armorType, card.tier);
  }
  return "";
}

/**
 * Strip rendered below the active-realm stats showing the card's
 * *original* (source-preset) stats and element vocabulary. Only renders
 * when a real translation hop applies. Loading / missing-adapter /
 * error states fall through to a status line instead of stat rows —
 * the parent has already rendered the native stats up top in those
 * cases, so the source card itself isn't useful to show twice.
 */
function OriginalStrip({
  card,
  sourcePreset,
  hasAdapter,
  hasTranslation,
  adapter,
  isFetching,
  isError,
}: {
  card: AssetCardType;
  sourcePreset: Preset;
  hasAdapter: boolean;
  hasTranslation: boolean;
  adapter: `0x${string}`;
  isFetching: boolean;
  isError: boolean;
}) {
  const isWeapon = card.slot === "weapon";
  const reduced = useReducedMotion();
  const damageElement =
    isWeapon && card.element && card.element !== "none"
      ? (card.element as Exclude<Element, "none">)
      : null;
  const resistElement =
    !isWeapon && card.resistElement && card.resistElement !== "none"
      ? (card.resistElement as Exclude<Element, "none">)
      : null;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={withReducedMotion(fadeRise, reduced)}
      className="mt-1 rounded-md p-2 flex flex-col gap-1 border border-dashed"
      style={{
        background:
          "color-mix(in oklab, var(--color-preset-accent) 7%, transparent)",
        borderColor:
          "color-mix(in oklab, var(--color-preset-accent) 35%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-preset-accent)]">
          Translated from {sourcePreset}
        </span>
        {hasAdapter && (
          <span className="text-[10px] opacity-65 font-mono">
            via {shortAddr(adapter)}
          </span>
        )}
      </div>
      {!hasAdapter ? (
        <span className="text-[10px] opacity-70">
          No adapter deployed — equipping uses native stats.
        </span>
      ) : isError ? (
        <span className="text-[10px] text-[var(--color-warn)]">
          Adapter call failed — re-run <code>pnpm seed:adapters</code> if you
          restarted Anvil. Equipping uses native stats.
        </span>
      ) : !hasTranslation ? (
        <span className="text-[10px] opacity-70">
          {isFetching ? "Translating…" : "Awaiting adapter read."}
        </span>
      ) : (
        <>
          <div className="text-xs tabular-nums opacity-90">
            {typeLabelFor(card, sourcePreset) !== "" &&
              `${typeLabelFor(card, sourcePreset)} · `}
            {isWeapon ? (
              <>
                d{card.damageDie}
                {card.damageBonus ? `+${card.damageBonus}` : ""} damage · +
                {card.attackBonus ?? 0} attack
              </>
            ) : (
              <>
                +{card.acBonus ?? 0} AC · +{card.hpBonus ?? 0} HP
              </>
            )}
          </div>
          {(() => {
            if (!damageElement && !resistElement) {
              return null;
            }
            return (
              <div className="flex flex-wrap gap-1">
                {damageElement && (
                  <TranslatedElementChip
                    element={damageElement}
                    kind="damage"
                    preset={sourcePreset}
                  />
                )}
                {resistElement && (
                  <TranslatedElementChip
                    element={resistElement}
                    kind="resist"
                    preset={sourcePreset}
                  />
                )}
              </div>
            );
          })()}
        </>
      )}
    </motion.div>
  );
}

/**
 * Single-line element/effect rail. Height-reserved and non-wrapping so a
 * zero-chip card holds the same height as a three-chip one — cards stay
 * uniform instead of growing double-/triple-decker as the chip count climbs.
 *
 * Chips past the first line are clipped behind a right-edge fade at rest.
 * On hover / keyboard focus of the *card* (driven by the ancestor `group`),
 * the track ping-pongs horizontally so the hidden chips cycle into view and
 * back. The scroll distance is dynamic, so we measure it (`scrollWidth -
 * clientWidth`) and feed it to the `rail-scroll` keyframe via `--rail-shift`;
 * a medium-speed duration is derived from the distance via `--rail-dur`.
 * Reduced-motion users get no animation (overflow stays clipped — punted).
 */
function ChipRail({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const track = trackRef.current;
    if (!outer || !track) return;
    const measure = () => {
      setOverflow(Math.max(0, track.scrollWidth - outer.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(track);
    return () => ro.disconnect();
  }, [children]);

  const animate = overflow > 0 && !reduced;
  // Medium speed: ~80px/sec, clamped so short rails aren't jittery-fast and
  // long ones don't crawl.
  const dur = Math.min(5, Math.max(1.2, overflow / 80));

  return (
    <div
      ref={outerRef}
      className="overflow-hidden"
      style={
        overflow > 0
          ? {
              height: "1.375rem",
              maskImage:
                "linear-gradient(to right, #000 calc(100% - 1rem), transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, #000 calc(100% - 1rem), transparent)",
            }
          : { height: "1.375rem" }
      }
    >
      {/*
        `chip-rail-track` is the hook for the hover/focus reveal: globals.css
        animates `.group:hover/.group:focus-visible .chip-rail-track` with the
        `rail-scroll` keyframe, reading the measured `--rail-shift`/`--rail-dur`
        set below. We drive it from a plain class + global rule rather than a
        Tailwind arbitrary variant so the (long, var()-bearing) animation
        shorthand can't get dropped by JIT scanning. Only attached when the
        rail actually overflows and motion is allowed.
      */}
      <div
        ref={trackRef}
        className={
          "flex w-max flex-nowrap items-center gap-1 [&>*]:shrink-0" +
          (animate ? " chip-rail-track" : "")
        }
        style={
          animate
            ? ({
                "--rail-shift": `-${overflow}px`,
                "--rail-dur": `${dur}s`,
              } as CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

export function AssetCard({
  card,
  selected,
  onClick,
  compact,
  targetRealm,
  targetPreset: targetPresetProp,
  hideOriginal,
}: Props) {
  const isWeapon = card.slot === "weapon";
  const reduced = useReducedMotion();

  // Decide whether a real preset hop applies. The hook itself short-
  // circuits non-hop cases and returns the input card unchanged, but
  // we still need these locally to drive the strip + label vocabularies.
  // Fall back to card.realmPreset for cards from player-deployed realms
  // that aren't in the seeded-realms map.
  const sourcePreset = card.realmPreset ?? presetForRealm(card.realm);
  const targetPreset = targetPresetProp ?? (targetRealm ? presetForRealm(targetRealm) : null);
  const isHop =
    !!sourcePreset &&
    !!targetPreset &&
    sourcePreset !== targetPreset &&
    (card.slot === "weapon" || card.slot === "armor");

  // Always call the hook (rules-of-hooks). When `isHop` is false the
  // hook resolves synchronously to the input card.
  const safeRealm = (targetRealm ?? card.realm) as `0x${string}`;
  const {
    data: translated,
    isFetching,
    isError,
  } = useTranslatedCard(card, safeRealm, targetPresetProp);

  // `translated === card` (same identity) means the hook chose passthrough;
  // we only have a real translation to display when the identity differs.
  const hasTranslation = isHop && !!translated && translated !== card;

  // The card we show on top. When the player is "in" a different
  // preset's realm and we have a successful translation, that's what
  // should headline the card — the player sees their gear in the
  // current realm's language. Otherwise (no hop, fetching, or error)
  // fall back to the source card so the UI never shows empty stats.
  const displayCard: AssetCardType = hasTranslation ? translated! : card;

  // Vocabulary for the top element chips: target preset when we're
  // showing translated stats, otherwise the source preset (or canonical
  // fallback if neither resolves).
  const topLabelPreset: Preset | null = hasTranslation
    ? targetPreset
    : sourcePreset;

  const adapter = isHop
    ? getAdapterAddress(
        card.slot as "weapon" | "armor",
        sourcePreset!,
        targetPreset!,
      )
    : ZERO_ADDR;
  const hasAdapter = adapter !== ZERO_ADDR;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="group text-left w-full h-full rounded-lg p-3 pl-6 transition flex flex-col gap-2 border overflow-hidden relative"
      style={{
        // Tier-tinted glass surface so the card reads its rarity at a glance.
        // The tint stays low (8% base) so the dark glass dominates and body
        // text on `--color-preset-fg` keeps its contrast. When equipped, the
        // tier tint deepens and a solid tier-coloured spine band (with vertical
        // "Equipped" text) carries the state — no outline ring.
        background: selected
          ? `color-mix(in oklab, ${tierColor(
              displayCard.tier,
            )} 14%, var(--surface-2))`
          : `color-mix(in oklab, ${tierColor(
              displayCard.tier,
            )} 8%, var(--surface-1))`,
        // Inset glow off the left edge so the tier spine reads as rarity
        // rather than a plain divider. When equipped, lift the card with a
        // soft outer shadow instead of an outline so it floats above its peers
        // without a competing ring.
        boxShadow: selected
          ? `inset 3px 0 12px -4px ${tierColor(
              displayCard.tier,
            )}, 0 8px 24px -14px var(--glow)`
          : `inset 3px 0 12px -4px ${tierColor(displayCard.tier)}`,
        zIndex: selected ? 1 : undefined,
        // Per-side longhands only — mixing the `borderColor` shorthand with
        // the `borderLeft` shorthand (the tier spine) makes React warn about
        // conflicting border declarations on rerender. All non-left sides keep
        // the neutral border; the left edge is the tier-coloured spine. When
        // equipped the prominent spine band (below) sits over this edge.
        borderTopColor: "var(--border-1)",
        borderRightColor: "var(--border-1)",
        borderBottomColor: "var(--border-1)",
        borderLeftColor: tierColor(displayCard.tier),
        borderLeftWidth: "4px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <AnimatePresence>
        {selected && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 pl-0.5 pr-1 flex items-center justify-center origin-left"
            style={{
              background: `color-mix(in oklab, ${tierColor(
                displayCard.tier,
              )} 82%, transparent)`,
            }}
            initial={reduced ? false : { scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scaleX: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.span
              className="text-[9px] font-bold uppercase leading-none tracking-[0.2em]"
              style={{
                writingMode: "vertical-rl",
                color: "#13110d",
                textShadow:
                  "0 0 1px rgba(245,243,238,0.9), 0 0 2px rgba(245,243,238,0.5)",
              }}
              initial={reduced ? false : { opacity: 0, rotate: 180, y: 6 }}
              animate={{ opacity: 1, rotate: 180, y: 0 }}
              exit={{ opacity: 0, rotate: 180 }}
              transition={{ duration: 0.2, delay: reduced ? 0 : 0.06 }}
            >
              Equipped
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="font-semibold text-sm truncate">
          {cardDisplayName(
            card,
            sourcePreset ?? "fantasy",
            displayCard,
            topLabelPreset,
          )}
        </h4>
      </header>
      {!compact && (
        <p className="text-xs opacity-75 truncate">
          {displayCard.slot} · {displayCard.realmName}
        </p>
      )}
      <div className="text-xs opacity-80 tabular-nums">
        {isWeapon ? (
          <>
            d{displayCard.damageDie}
            {displayCard.damageBonus ? `+${displayCard.damageBonus}` : ""}{" "}
            damage · +{displayCard.attackBonus ?? 0} attack
          </>
        ) : (
          <>
            +{displayCard.acBonus ?? 0} AC · +{displayCard.hpBonus ?? 0} HP
          </>
        )}
      </div>
      <ChipRail>
        {isWeapon &&
          displayCard.element &&
          displayCard.element !== "none" && (
            <TranslatedElementChip
              element={displayCard.element as Exclude<Element, "none">}
              kind="damage"
              preset={topLabelPreset}
            />
          )}
        {!isWeapon &&
          displayCard.resistElement &&
          displayCard.resistElement !== "none" && (
            <TranslatedElementChip
              element={displayCard.resistElement as Exclude<Element, "none">}
              kind="resist"
              preset={topLabelPreset}
            />
          )}
        {displayCard.catalogEffects.map((e) => (
          <EffectChip key={e.name} effect={e} />
        ))}
      </ChipRail>
      {displayCard.preseed && (
        <ProvenanceChip>Genesis liquidity</ProvenanceChip>
      )}
      {isHop && !hideOriginal && (
        <OriginalStrip
          card={card}
          sourcePreset={sourcePreset!}
          hasAdapter={hasAdapter}
          hasTranslation={hasTranslation}
          adapter={adapter}
          isFetching={isFetching}
          isError={isError}
        />
      )}
    </button>
  );
}

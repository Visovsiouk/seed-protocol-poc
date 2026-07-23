"use client";

/**
 * `<RealmSpawnFeed/>` — the create-flow choreography.
 *
 * The three-signature realm-spawn ceremony rendered as ledger entries
 * being *stamped in real time*: deploy the ecosystem clone, authorize the
 * mint delegate, register the realm charter. Each beat advances from
 * pending → signing → stamped as the parent's step machine moves through
 * `signing_create → signing_minter → registering → done`, so the player
 * watches a new world being minted line by line (protocol claim 2).
 *
 * Pure presentation: the parent owns the tx state machine and passes the
 * current `phase`. Motion uses the shared ledger stagger and honours
 * `prefers-reduced-motion` via `withReducedMotion`.
 */

import { motion, useReducedMotion } from "framer-motion";
import { fadeRise, ledgerStagger, withReducedMotion } from "@/lib/ui/motion";
import { Panel, Stamp, ExplorerLink } from "@/components/ui";

export type SpawnPhase = "create" | "schema" | "minter" | "register" | "done";

type BeatStatus = "pending" | "active" | "stamped";

const BEATS: readonly { key: SpawnPhase; title: string; call: string }[] = [
  { key: "create", title: "Deploy ecosystem clone", call: "createEcosystem()" },
  { key: "schema", title: "Register realm schemas", call: "registerSchema() ×2" },
  { key: "minter", title: "Authorize mint delegate", call: "setMinter()" },
  { key: "register", title: "Register realm charter", call: "POST /register" },
];

const ORDER: Record<SpawnPhase, number> = {
  create: 0,
  schema: 1,
  minter: 2,
  register: 3,
  done: 4,
};

const BEAT_COUNT = BEATS.length;

function statusFor(beat: SpawnPhase, phase: SpawnPhase): BeatStatus {
  const here = ORDER[beat];
  const at = ORDER[phase];
  if (at > here) return "stamped";
  if (at === here) return "active";
  return "pending";
}

export function RealmSpawnFeed({
  phase,
  ecosystem,
  signerIndex,
  signerAddress,
}: {
  phase: SpawnPhase;
  /** Revealed once step 1 lands. */
  ecosystem?: `0x${string}`;
  /** Revealed once the delegate slot is claimed. */
  signerIndex?: number;
  signerAddress?: `0x${string}`;
}) {
  const reduced = useReducedMotion();

  return (
    <Panel
      as="section"
      tone="glass-2"
      glow="accent"
      aria-label="Spawning realm"
      className="flex flex-col gap-4 p-5"
    >
      <header className="flex items-baseline justify-between gap-2">
        <Stamp tone="accent">Spawning realm</Stamp>
        <span className="font-mono text-[10px] uppercase tracking-widest opacity-65">
          {phase === "done"
            ? `${BEAT_COUNT} / ${BEAT_COUNT} stamped`
            : `${ORDER[phase]} / ${BEAT_COUNT} stamped`}
        </span>
      </header>

      <motion.ol
        initial="hidden"
        animate="visible"
        variants={withReducedMotion(ledgerStagger, reduced)}
        className="flex flex-col"
      >
        {BEATS.map((beat) => {
          const status = statusFor(beat.key, phase);
          const detail =
            beat.key === "create"
              ? ecosystem && status === "stamped"
                ? (
                    <>
                      →{" "}
                      <ExplorerLink type="address" value={ecosystem}>
                        {shortAddr(ecosystem)}
                      </ExplorerLink>
                    </>
                  )
                : "Confirm the factory call in your wallet."
              : beat.key === "schema"
                ? "Sign two registerSchema calls — clearReceipt + loot."
                : beat.key === "minter"
                  ? signerAddress
                    ? (
                        <>
                          slot #{signerIndex} ·{" "}
                          <ExplorerLink type="address" value={signerAddress}>
                            {shortAddr(signerAddress)}
                          </ExplorerLink>
                        </>
                      )
                    : "Sign setMinter against your new realm."
                  : "Server verifies ownership, minter rights + schemas.";

          return (
            <motion.li
              key={beat.key}
              variants={withReducedMotion(fadeRise, reduced)}
              className="flex items-start gap-3 border-b border-dashed border-[var(--border-1)] py-3 last:border-b-0"
            >
              <BeatMark status={status} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ opacity: status === "pending" ? 0.45 : 1 }}
                  >
                    {beat.title}
                  </span>
                  <code className="font-mono text-[10px] opacity-60">
                    {beat.call}
                  </code>
                </div>
                <span
                  className="text-[11px] leading-relaxed"
                  style={{
                    opacity: status === "pending" ? 0.35 : 0.7,
                    color:
                      status === "active"
                        ? "var(--color-preset-accent)"
                        : undefined,
                  }}
                >
                  {detail}
                </span>
              </div>
            </motion.li>
          );
        })}
      </motion.ol>
    </Panel>
  );
}

/**
 * The per-beat status glyph: a hollow slot while pending, a pulsing ring
 * while the signature is in flight, and a stamped accent disc once the
 * tx lands.
 */
function BeatMark({ status }: { status: BeatStatus }) {
  if (status === "stamped") {
    return (
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[var(--color-preset-bg)]"
        style={{ background: "var(--color-ok)" }}
      >
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <motion.span
        aria-hidden
        className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-[var(--color-preset-accent)]"
        animate={{ opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-dashed border-[var(--border-2)]"
    />
  );
}

function shortAddr(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

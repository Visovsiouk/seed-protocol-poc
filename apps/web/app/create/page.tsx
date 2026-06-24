"use client";

/**
 * `/create` — realm creation flow.
 *
 * Four-tx ceremony, all surfaced inline:
 *
 *   1. `EcosystemFactory.createEcosystem()` — player-signed. The
 *      caller becomes `owner()` of a fresh `EcosystemTemplate` clone
 *      (royalty + dashboard rights pinned to this address; see
 *      `UniversalAsset.mintedBy`).
 *
 *   2. `EcosystemTemplate.registerSchema()` ×2 — player-signed, against
 *      the new clone. Registers the realm's own `clearReceipt` + `loot`
 *      schemas so the assets it mints carry true per-realm provenance
 *      (`createdByEcosystem == thisRealm`) instead of borrowing the
 *      starter's pair. The returned schema ids are persisted in step 4.
 *
 *   3. `EcosystemTemplate.setMinter(derivedAddr, true)` — player-signed
 *      again. Authorizes a server-held HD-derived delegate to call
 *      `mintAsset(onlyOwnerOrMinter)` on this realm so the play loop can
 *      mint loot / clearReceipts while the owner is offline. The delegate
 *      has no other powers — the owner keeps royalty + dashboard control.
 *
 *   4. `POST /api/realm/register` — no signature, just metadata + the
 *      schema ids from step 2. The server verifies `owner() == player`,
 *      `minters[derivedAddr]`, AND that each schema id exists and was
 *      `createdByEcosystem == realm` before inserting the row, then
 *      returns the canonical `signerIndex` and the row's `maxTier` cap.
 *
 * Race handling: between step (1) and step (3) another `/create` may
 * grab the same `signerIndex` from `getNextSignerIndex`. The server's
 * register-route catches that and replies 409 with a `retryWith`
 * payload; we replay step (3) against the corrected index.
 *
 * On step (4) success we route to `/play/realm/[address]`, which fetches
 * the metadata from `/api/realm/[address]/meta` and runs the engine in
 * the preset/boss the player picked.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { ecosystemFactoryAbi, ecosystemTemplateAbi } from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import { useCreateEcosystem } from "@/lib/contracts/factory";
import { useRegisterRealmSchemas } from "@/lib/contracts/register-schemas";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { ProtocolSurfaceGate } from "@/components/guards/ProtocolSurfaceGate";
import { RealmSpawnFeed, type SpawnPhase } from "@/components/create/RealmSpawnFeed";
import { AppShell, Panel, Button, Stamp, Rule, Chip } from "@/components/ui";
import { effectMeta } from "@/lib/ui/loot-visuals";
import { REALM_ACCENTS } from "@/lib/ui/accents";
import { getFlavorBank } from "@/lib/flavor";
import type { BossDef, Preset } from "@/lib/engine/types";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"] as const;

type Step =
  | { kind: "form" }
  | { kind: "signing_create" }
  | { kind: "signing_schema"; ecosystem: `0x${string}` }
  | { kind: "signing_minter"; ecosystem: `0x${string}`; signerAddress: `0x${string}`; signerIndex: number }
  | { kind: "registering"; ecosystem: `0x${string}`; signerAddress: `0x${string}`; signerIndex: number }
  | { kind: "done"; ecosystem: `0x${string}`; txHash: `0x${string}`; signerAddress: `0x${string}`; signerIndex: number; maxTier: number }
  | { kind: "error"; message: string };

type NextSignerReply =
  | { ok: true; signerIndex: number; signerAddress: `0x${string}` }
  | { ok: false; reason: string; message: string };

type RegisterReply =
  | {
      ok: true;
      realm: {
        address: `0x${string}`;
        owner: `0x${string}`;
        preset: Preset;
        bossId: string;
        name: string;
        signerIndex: number;
        signerAddress: `0x${string}`;
        maxTier: number;
      };
    }
  | {
      ok: false;
      reason: string;
      message: string;
      retryWith?: { signerIndex: number; signerAddress: `0x${string}` };
    };

function shortAddress(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function fetchNextSigner(): Promise<NextSignerReply> {
  const res = await fetch("/api/realm/next-signer", { cache: "no-store" });
  return (await res.json()) as NextSignerReply;
}

export default function CreatePage() {
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { createEcosystem } = useCreateEcosystem();
  const { registerRealmSchemas } = useRegisterRealmSchemas();
  const { writeContractAsync } = useWriteContract();

  const tutorialQuery = useTutorialProgress(address);
  const hasSeed = tutorialQuery.data?.hasSeed === true;
  const seedKnown = !!address && tutorialQuery.isSuccess;
  const seedGate = !!address && seedKnown && !hasSeed;

  // 1 Seed = 1 Ecosystem: the factory pins each owner's realm in
  // `ecosystemOf(owner)`, returning the zero address until they found
  // one. A non-zero value means this wallet already spent its seed, so
  // `createEcosystem()` would revert "Seed already spent on an
  // ecosystem". Gate the form on it and point the player at their realm
  // instead of letting them sign a doomed tx.
  const ZERO = "0x0000000000000000000000000000000000000000" as const;
  const existingRealmQuery = useReadContract({
    address: getAddress("ecosystemFactory"),
    abi: ecosystemFactoryAbi,
    functionName: "ecosystemOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const existingRealm =
    existingRealmQuery.data && existingRealmQuery.data !== ZERO
      ? (existingRealmQuery.data as `0x${string}`)
      : null;
  const alreadyFounded = !!existingRealm;

  const [preset, setPreset] = useState<Preset>("fantasy");
  const [bossId, setBossId] = useState<string>("forest_hag");
  const [realmName, setRealmName] = useState<string>("");
  // null → inherit the genre default accent; otherwise a curated hex.
  const [accent, setAccent] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "form" });

  // Boss options pull from the chosen preset's flavor bank — same
  // source the engine + register-route validate against, so the
  // dropdown can't drift out of sync. When the preset flips, snap
  // the bossId back to the first key in the new bank.
  const bossOptions = useMemo(() => {
    const bank = getFlavorBank(preset);
    return Object.entries(bank.bosses).map(([id, def]) => ({ id, def }));
  }, [preset]);

  const onChangePreset = (p: Preset) => {
    setPreset(p);
    const opts = Object.keys(getFlavorBank(p).bosses);
    if (!opts.includes(bossId) && opts.length > 0) setBossId(opts[0]!);
  };

  const busy =
    step.kind === "signing_create" ||
    step.kind === "signing_schema" ||
    step.kind === "signing_minter" ||
    step.kind === "registering";

  const canSubmit =
    !!address &&
    !seedGate &&
    !alreadyFounded &&
    !busy &&
    step.kind === "form" &&
    realmName.trim().length > 0;

  /**
   * Step 2 + 3, with race retry. Signing setMinter is signed by the
   * player's wallet; the route's UNIQUE constraint serializes
   * concurrent creates so we may need to re-sign for a new index.
   */
  const authorizeAndRegister = async (
    ecosystem: `0x${string}`,
    initial: { signerIndex: number; signerAddress: `0x${string}` },
    schemaIds: { clearReceipt: string; loot: string },
  ) => {
    let signerIndex = initial.signerIndex;
    let signerAddress = initial.signerAddress;

    // Cap retry attempts so a buggy server can't loop us forever.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      setStep({ kind: "signing_minter", ecosystem, signerAddress, signerIndex });
      const minterTxHash = await writeContractAsync({
        address: ecosystem,
        abi: ecosystemTemplateAbi,
        functionName: "setMinter",
        args: [signerAddress, true],
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: minterTxHash });
      }

      setStep({ kind: "registering", ecosystem, signerAddress, signerIndex });
      const res = await fetch("/api/realm/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          realmAddress: ecosystem,
          owner: address,
          preset,
          bossId,
          name: realmName.trim(),
          accent,
          clearReceiptSchemaId: schemaIds.clearReceipt,
          lootSchemaId: schemaIds.loot,
        }),
      });
      const body = (await res.json()) as RegisterReply;
      if (body.ok) {
        return {
          ecosystem: body.realm.address,
          signerAddress: body.realm.signerAddress,
          signerIndex: body.realm.signerIndex,
          maxTier: body.realm.maxTier,
        };
      }
      // Race: server tells us the index we authorized was stolen by
      // another concurrent create. Re-sign for the next slot.
      if (body.reason === "race" && body.retryWith) {
        signerIndex = body.retryWith.signerIndex;
        signerAddress = body.retryWith.signerAddress;
        continue;
      }
      throw new Error(`register[${body.reason}]: ${body.message}`);
    }
    throw new Error("register: exhausted retries while racing for signer index");
  };

  const onDeploy = async () => {
    if (!address) return;
    try {
      // Step 1: factory call. Returns the new clone address.
      setStep({ kind: "signing_create" });
      const create = await createEcosystem();

      // Step 2: register the realm's own clearReceipt + loot schemas on
      // its fresh clone. Owner-signed; the returned ids are bound to this
      // ecosystem so its future mints carry true per-realm provenance.
      setStep({ kind: "signing_schema", ecosystem: create.ecosystem });
      const schemaIds = await registerRealmSchemas(create.ecosystem);

      // Step 2.5: pull the proposed signer slot. Advisory — claimed
      // by the register route when the row is inserted.
      const next = await fetchNextSigner();
      if (!next.ok) throw new Error(`next-signer[${next.reason}]: ${next.message}`);

      // Steps 3 + 4 with retry.
      const result = await authorizeAndRegister(
        create.ecosystem,
        {
          signerIndex: next.signerIndex,
          signerAddress: next.signerAddress,
        },
        {
          clearReceipt: schemaIds.clearReceipt.toString(),
          loot: schemaIds.loot.toString(),
        },
      );

      setStep({
        kind: "done",
        ecosystem: result.ecosystem,
        txHash: create.txHash,
        signerAddress: result.signerAddress,
        signerIndex: result.signerIndex,
        maxTier: result.maxTier,
      });
      // The realm is seeded — drop the player back at the base. Their new
      // realm shows up among the community doors there. The Doors station is
      // the base's default room.
      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStep({ kind: "error", message });
    }
  };

  const onReset = () => setStep({ kind: "form" });

  // Map the on-chain step machine onto the spawn-feed's beat phases.
  const spawnPhase: SpawnPhase | null =
    step.kind === "signing_create"
      ? "create"
      : step.kind === "signing_schema"
        ? "schema"
        : step.kind === "signing_minter"
          ? "minter"
          : step.kind === "registering"
            ? "register"
            : null;
  const spawning =
    step.kind === "signing_create" ||
    step.kind === "signing_schema" ||
    step.kind === "signing_minter" ||
    step.kind === "registering";
  const spawnEcosystem =
    "ecosystem" in step ? (step.ecosystem as `0x${string}`) : undefined;
  const spawnSignerIndex =
    "signerIndex" in step ? (step.signerIndex as number) : undefined;
  const spawnSignerAddress =
    "signerAddress" in step
      ? (step.signerAddress as `0x${string}`)
      : undefined;

  return (
    <ProtocolSurfaceGate>
      <AppShell title="Create a realm" back={{ href: "/", label: "← The base" }}>
        <section
          className="mx-auto flex max-w-3xl flex-col gap-6"
          data-preset={preset}
          style={
            accent
              ? ({ "--color-preset-accent": accent } as React.CSSProperties)
              : undefined
          }
        >
          <Panel as="aside" tone="glass-1" aria-label="Flow explainer" className="p-4">
            <Stamp tone="accent">The founding rite</Stamp>
            <p className="mt-2 text-sm leading-relaxed opacity-80">
              Four signatures: deploy the ecosystem clone, register your
              realm&apos;s own asset schemas, authorize a server-held mint
              delegate, then register the realm&apos;s cosmetic charter. You
              stay the on-chain owner — royalties on every asset sold from
              your realm flow to your wallet, forever.
            </p>
            <p className="mt-2 text-sm leading-relaxed opacity-80">
              Your realm opens at loot tier <strong>T3</strong> and earns its
              ceiling from real play: <strong>T4 at 20 distinct clearers</strong>,{" "}
              <strong>T5 at 50</strong>. Each unique wallet that beats your boss
              counts once, so the cap tracks reach, not grinding.
            </p>
          </Panel>

          {!address && (
            <Panel
              as="aside"
              tone="glass-2"
              className="p-4 text-sm"
              style={{
                background:
                  "color-mix(in oklab, var(--color-warn) 9%, transparent)",
                borderColor:
                  "color-mix(in oklab, var(--color-warn) 35%, transparent)",
              }}
            >
              Connect a wallet to deploy a realm. The connected account pays
              gas and becomes the realm owner.
            </Panel>
          )}

          {seedGate && (
            <Panel
              as="aside"
              tone="glass-2"
              aria-label="Seed required"
              className="flex flex-col items-center gap-3 p-6 text-center"
            >
              <Stamp tone="muted">Sealed · Seed required</Stamp>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                Authorship is earned
              </h2>
              <p className="max-w-md text-sm leading-relaxed opacity-75">
                Realm authorship is reserved for holders of the Genesis Seed
                SBT. Clear all three starter realms to earn the right to found
                your own.
              </p>
              <Rule tone="muted" />
              <Link href="/">
                <Button intent="ghost" size="sm">
                  Back to realms →
                </Button>
              </Link>
            </Panel>
          )}

          {alreadyFounded && existingRealm && (
            <Panel
              as="aside"
              tone="glass-2"
              aria-label="Realm already founded"
              className="flex flex-col items-center gap-3 p-6 text-center"
            >
              <Stamp tone="accent">One seed · one realm</Stamp>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                You&apos;ve already founded your realm
              </h2>
              <p className="max-w-md text-sm leading-relaxed opacity-75">
                The Genesis Seed is spent the moment you deploy an ecosystem —
                it&apos;s soulbound and singular. Your realm lives at{" "}
                <span className="font-mono break-all">
                  {shortAddress(existingRealm)}
                </span>
                . Tend the one you have rather than minting another.
              </p>
              <Rule tone="accent" />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link href={`/realm/${existingRealm}`}>
                  <Button intent="primary" size="sm">
                    Open your realm dashboard →
                  </Button>
                </Link>
                <Link href={`/play/realm/${existingRealm}`}>
                  <Button intent="ghost" size="sm">
                    Play your realm
                  </Button>
                </Link>
              </div>
            </Panel>
          )}

          {step.kind === "form" && !alreadyFounded && (
            <>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1">
                  <Stamp tone="accent">1 · Choose a genre</Stamp>
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => {
                    const active = preset === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        data-preset={p}
                        onClick={() => onChangePreset(p)}
                        disabled={!address || seedGate}
                        aria-pressed={active}
                        className="rounded-lg px-3 py-3 text-sm font-medium transition disabled:opacity-50 bg-[var(--surface-1)]"
                        style={{
                          borderWidth: 1,
                          borderStyle: "solid",
                          borderColor: active
                            ? "var(--color-preset-accent)"
                            : "var(--border-1)",
                          background: active
                            ? "color-mix(in oklab, var(--color-preset-accent) 12%, var(--surface-1))"
                            : undefined,
                          boxShadow: active
                            ? "0 0 20px -8px var(--glow)"
                            : undefined,
                        }}
                      >
                        {getFlavorBank(p).presetDisplayName}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] opacity-70">
                  Drives narration, monster pool, and loot vocabulary. The
                  schema pair the realm uses on-chain comes from the
                  preset&apos;s starter realm.
                </p>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1">
                  <Stamp tone="accent">2 · Set the final boss</Stamp>
                </legend>
                <div className="grid gap-2" role="radiogroup" aria-label="Final boss">
                  {bossOptions.map(({ id, def }) => (
                    <BossOption
                      key={id}
                      def={def}
                      selected={bossId === id}
                      disabled={!address || seedGate}
                      onSelect={() => setBossId(id)}
                    />
                  ))}
                </div>
                <p className="text-[11px] opacity-70">
                  Shown at BOSS_DEPTH with two baked-in effects. Stats are
                  tuned for T2 gear — a cleared boss mints a clearReceipt on
                  your realm.
                </p>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1">
                  <Stamp tone="accent">3 · Name your realm</Stamp>
                </legend>
                <input
                  id="realm-name"
                  value={realmName}
                  onChange={(e) => setRealmName(e.target.value)}
                  maxLength={64}
                  placeholder="e.g. The Hollow Sanctum"
                  disabled={!address || seedGate}
                  className="rounded-md px-3 py-2 text-sm disabled:opacity-50 bg-[var(--surface-2)] border border-[var(--border-1)] text-[var(--color-preset-fg)]"
                />
                <p className="text-[11px] opacity-70">
                  Shown in the realm selector and on the play page. Up to 64
                  characters.
                </p>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1">
                  <Stamp tone="accent">4 · Accent · optional</Stamp>
                </legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Realm accent">
                  <button
                    type="button"
                    onClick={() => setAccent(null)}
                    disabled={!address || seedGate}
                    aria-pressed={accent === null}
                    aria-label="Genre default accent"
                    title="Genre default"
                    className="grid h-9 w-9 place-items-center rounded-full text-[10px] uppercase transition disabled:opacity-50 bg-[var(--surface-2)]"
                    style={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor:
                        accent === null
                          ? "var(--color-preset-fg)"
                          : "var(--border-1)",
                      outline:
                        accent === null
                          ? "3px solid var(--color-preset-fg)"
                          : "none",
                      outlineOffset: 3,
                      transform: accent === null ? "scale(1.2)" : undefined,
                      boxShadow:
                        accent === null ? "0 0 20px -2px var(--glow)" : undefined,
                      zIndex: accent === null ? 1 : undefined,
                    }}
                  >
                    A
                  </button>
                  {REALM_ACCENTS.map((sw) => {
                    const active = accent === sw.hex;
                    return (
                      <button
                        key={sw.hex}
                        type="button"
                        onClick={() => setAccent(sw.hex)}
                        disabled={!address || seedGate}
                        aria-pressed={active}
                        aria-label={`${sw.label} accent`}
                        title={sw.label}
                        className="h-9 w-9 rounded-full transition disabled:opacity-50"
                        style={{
                          background: sw.hex,
                          borderWidth: 1,
                          borderStyle: "solid",
                          borderColor: active
                            ? "var(--color-preset-fg)"
                            : "transparent",
                          outline: active
                            ? "3px solid var(--color-preset-fg)"
                            : "none",
                          outlineOffset: 3,
                          transform: active ? "scale(1.2)" : undefined,
                          boxShadow: active ? `0 0 22px -2px ${sw.hex}` : undefined,
                          zIndex: active ? 1 : undefined,
                        }}
                      />
                    );
                  })}
                </div>
                <p className="text-[11px] opacity-70">
                  Recolours your realm&apos;s glow, borders, and buttons.
                  Leave on <strong>A</strong> to inherit the genre&apos;s
                  signature colour. The form above previews your choice.
                </p>
              </fieldset>

              <div className="flex flex-col gap-3">
                <Button
                  intent="primary"
                  onClick={onDeploy}
                  disabled={!canSubmit}
                  className="self-start"
                >
                  Deploy realm
                </Button>
              </div>
            </>
          )}

          {spawning && spawnPhase && (
            <RealmSpawnFeed
              phase={spawnPhase}
              ecosystem={spawnEcosystem}
              signerIndex={spawnSignerIndex}
              signerAddress={spawnSignerAddress}
            />
          )}

          {step.kind === "error" && (
            <Panel
              as="aside"
              role="alert"
              tone="glass-2"
              className="flex flex-col gap-3 p-4 text-sm"
              style={{
                background:
                  "color-mix(in oklab, var(--color-danger) 9%, transparent)",
                borderColor:
                  "color-mix(in oklab, var(--color-danger) 35%, transparent)",
              }}
            >
              <p>
                <strong className="text-[var(--color-danger)]">
                  Deploy failed.
                </strong>{" "}
                {step.message}
              </p>
              <Button intent="ghost" size="sm" onClick={onReset} className="self-start">
                Back to form
              </Button>
            </Panel>
          )}

          {step.kind === "done" && (
            <Panel
              as="section"
              tone="glass-2"
              glow="accent"
              aria-label="Deployment receipt"
              className="flex flex-col gap-3 p-5 text-sm"
            >
              <header className="flex items-baseline justify-between gap-2">
                <Stamp tone="accent">Realm spawned</Stamp>
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                  Owner {address ? shortAddress(address) : ""}
                </span>
              </header>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                {realmName.trim() || "Your realm"}
              </h2>
              <Rule tone="accent" />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="opacity-65">Address</dt>
                <dd className="font-mono break-all">{step.ecosystem}</dd>
                <dt className="opacity-65">Delegate</dt>
                <dd>
                  slot #{step.signerIndex} ·{" "}
                  <span className="font-mono">
                    {shortAddress(step.signerAddress)}
                  </span>
                </dd>
                <dt className="opacity-65">Loot tier</dt>
                <dd>
                  T{step.maxTier} · earns T4 at 20 clearers, T5 at 50
                </dd>
              </dl>
              <p className="break-all font-mono text-[11px] opacity-65">
                tx {step.txHash}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Link href={`/play/realm/${step.ecosystem}`}>
                  <Button intent="primary" size="sm">
                    Play your realm →
                  </Button>
                </Link>
                <Link href="/" className="text-sm opacity-80 hover:opacity-100">
                  Back to selector
                </Link>
              </div>
            </Panel>
          )}
        </section>
      </AppShell>
    </ProtocolSurfaceGate>
  );
}

/**
 * Selectable boss row showing the boss's "feel": its two baked-in catalog
 * effects plus headline stats, so the choice reads as a
 * playstyle pick rather than a name in a dropdown.
 */
function BossOption({
  def,
  selected,
  disabled,
  onSelect,
}: {
  def: BossDef;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className="flex flex-col gap-2 rounded-lg p-3 text-left transition disabled:opacity-50 bg-[var(--surface-1)]"
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: selected ? "var(--color-preset-accent)" : "var(--border-1)",
        background: selected
          ? "color-mix(in oklab, var(--color-preset-accent) 10%, var(--surface-1))"
          : undefined,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{def.name}</span>
        <span className="font-mono text-[10px] tabular-nums opacity-70">
          {def.baseHp} HP · d{def.attackDie} · AC {def.ac}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {def.bakedEffects.map((name) => {
          const meta = effectMeta(name);
          if (!meta) return null;
          return <Chip key={name} color={meta.color} label={meta.label} />;
        })}
      </div>
    </button>
  );
}

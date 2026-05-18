"use client";

/**
 * `/create` — realm creation flow.
 *
 * Three-tx ceremony, all surfaced inline:
 *
 *   1. `EcosystemFactory.createEcosystem()` — player-signed. The
 *      caller becomes `owner()` of a fresh `EcosystemTemplate` clone
 *      (royalty + dashboard rights pinned to this address; see
 *      `UniversalAsset.mintedBy`).
 *
 *   2. `EcosystemTemplate.setMinter(derivedAddr, true)` — player-signed
 *      again, against the just-deployed clone. Authorizes a server-held
 *      HD-derived delegate to call `mintAsset(onlyOwnerOrMinter)` on
 *      this realm so the play loop can mint loot / clearReceipts while
 *      the owner is offline. The delegate has no other powers — the
 *      owner keeps royalty and dashboard control.
 *
 *   3. `POST /api/realm/register` — no signature, just metadata. The
 *      server verifies `owner() == player` AND `minters[derivedAddr]`
 *      on-chain before inserting the row, then returns the canonical
 *      `signerIndex` (the realm's permanent HD slot) and the row's
 *      `maxTier` cap.
 *
 * Race handling: between step (1) and step (2) another `/create` may
 * grab the same `signerIndex` from `getNextSignerIndex`. The server's
 * register-route catches that and replies 409 with a `retryWith`
 * payload; we replay step (2) against the corrected index.
 *
 * On step (3) success we route to `/play/realm/[address]`, which fetches
 * the metadata from `/api/realm/[address]/meta` and runs the engine in
 * the preset/boss the player picked.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ecosystemTemplateAbi } from "@abis/generated";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useCreateEcosystem } from "@/lib/contracts/factory";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { getFlavorBank } from "@/lib/flavor";
import type { Preset } from "@/lib/engine/types";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"] as const;

type Step =
  | { kind: "form" }
  | { kind: "signing_create" }
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
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { createEcosystem } = useCreateEcosystem();
  const { writeContractAsync } = useWriteContract();

  const tutorialQuery = useTutorialProgress(address);
  const hasSeed = tutorialQuery.data?.hasSeed === true;
  const seedKnown = !!address && tutorialQuery.isSuccess;
  const seedGate = !!address && seedKnown && !hasSeed;

  const [preset, setPreset] = useState<Preset>("fantasy");
  const [bossId, setBossId] = useState<string>("forest_hag");
  const [realmName, setRealmName] = useState<string>("");
  const [step, setStep] = useState<Step>({ kind: "form" });

  // Boss options pull from the chosen preset's flavor bank — same
  // source the engine + register-route validate against, so the
  // dropdown can't drift out of sync. When the preset flips, snap
  // the bossId back to the first key in the new bank.
  const bossOptions = useMemo(() => {
    const bank = getFlavorBank(preset);
    return Object.entries(bank.bosses).map(([id, b]) => ({ id, name: b.name }));
  }, [preset]);

  const onChangePreset = (p: Preset) => {
    setPreset(p);
    const opts = Object.keys(getFlavorBank(p).bosses);
    if (!opts.includes(bossId) && opts.length > 0) setBossId(opts[0]!);
  };

  const busy =
    step.kind === "signing_create" ||
    step.kind === "signing_minter" ||
    step.kind === "registering";

  const canSubmit =
    !!address && !seedGate && !busy && step.kind === "form" && realmName.trim().length > 0;

  /**
   * Step 2 + 3, with race retry. Signing setMinter is signed by the
   * player's wallet; the route's UNIQUE constraint serializes
   * concurrent creates so we may need to re-sign for a new index.
   */
  const authorizeAndRegister = async (
    ecosystem: `0x${string}`,
    initial: { signerIndex: number; signerAddress: `0x${string}` },
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

      // Step 1.5: pull the proposed signer slot. Advisory — claimed
      // by the register route when the row is inserted.
      const next = await fetchNextSigner();
      if (!next.ok) throw new Error(`next-signer[${next.reason}]: ${next.message}`);

      // Steps 2 + 3 with retry.
      const result = await authorizeAndRegister(create.ecosystem, {
        signerIndex: next.signerIndex,
        signerAddress: next.signerAddress,
      });

      setStep({
        kind: "done",
        ecosystem: result.ecosystem,
        txHash: create.txHash,
        signerAddress: result.signerAddress,
        signerIndex: result.signerIndex,
        maxTier: result.maxTier,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStep({ kind: "error", message });
    }
  };

  const onReset = () => setStep({ kind: "form" });

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mx-auto mb-8 flex max-w-3xl items-center justify-between">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← Realms
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Create a realm</h1>
        <ConnectButton />
      </header>

      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <aside
          aria-label="Flow explainer"
          className="rounded-md p-4 text-sm leading-relaxed"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <p>
            Three signatures: deploy the ecosystem clone, authorize a
            server-held mint delegate, register the realm&apos;s
            cosmetic metadata. You stay the on-chain owner — royalties
            on every asset sold from your realm flow to your wallet.
          </p>
        </aside>

        {!address && (
          <aside
            className="rounded-md p-4 text-sm"
            style={{
              background: "rgba(255,196,0,0.10)",
              border: "1px solid rgba(255,196,0,0.35)",
            }}
          >
            Connect a wallet to deploy a realm. The connected account
            pays gas and becomes the realm owner.
          </aside>
        )}

        {seedGate && (
          <aside
            aria-label="Seed required"
            className="rounded-md p-4 text-sm leading-relaxed"
            style={{
              background: "rgba(255,196,0,0.10)",
              border: "1px solid rgba(255,196,0,0.35)",
            }}
          >
            <p>
              <strong>Seed required.</strong> Realm authorship is
              reserved for holders of the Genesis Seed SBT — clear all
              three starter realms first.
            </p>
            <div className="mt-3 flex gap-3">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-sm"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                Back to realms →
              </Link>
            </div>
          </aside>
        )}

        {step.kind === "form" && (
          <>
            <fieldset className="flex flex-col gap-3">
              <legend className="text-xs uppercase tracking-widest opacity-70">
                Flavor preset
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChangePreset(p)}
                    disabled={!address || seedGate}
                    className="rounded-md px-3 py-2 text-sm transition disabled:opacity-50"
                    style={{
                      background:
                        preset === p
                          ? "rgba(255,255,255,0.10)"
                          : "rgba(255,255,255,0.04)",
                      border:
                        preset === p
                          ? "1px solid rgba(255,255,255,0.30)"
                          : "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    {getFlavorBank(p).presetDisplayName}
                  </button>
                ))}
              </div>
              <p className="text-[11px] opacity-60">
                Drives narration, monster pool, and loot vocabulary. The
                schema pair the realm uses on-chain comes from the
                preset&apos;s starter realm.
              </p>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <label
                htmlFor="boss-select"
                className="text-xs uppercase tracking-widest opacity-70"
              >
                Final boss
              </label>
              <select
                id="boss-select"
                value={bossId}
                onChange={(e) => setBossId(e.target.value)}
                disabled={!address || seedGate}
                className="rounded-md px-3 py-2 text-sm disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                }}
              >
                {bossOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] opacity-60">
                Shown at BOSS_DEPTH. Stats are tuned for T2 gear — a
                cleared boss mints a clearReceipt on your realm.
              </p>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <label
                htmlFor="realm-name"
                className="text-xs uppercase tracking-widest opacity-70"
              >
                Realm name
              </label>
              <input
                id="realm-name"
                value={realmName}
                onChange={(e) => setRealmName(e.target.value)}
                maxLength={64}
                placeholder="e.g. The Hollow Sanctum"
                disabled={!address || seedGate}
                className="rounded-md px-3 py-2 text-sm disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                }}
              />
              <p className="text-[11px] opacity-60">
                Shown in the realm selector and on the play page. Up to
                64 characters.
              </p>
            </fieldset>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={onDeploy}
                disabled={!canSubmit}
                className="self-start rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50"
                style={{
                  background: "var(--color-preset-bg, rgba(255,255,255,0.08))",
                  color: "var(--color-preset-fg, #fff)",
                  border:
                    "1px solid var(--color-preset-accent, rgba(255,255,255,0.18))",
                }}
              >
                Deploy realm
              </button>
            </div>
          </>
        )}

        {step.kind === "signing_create" && (
          <ProgressPanel
            title="Signing createEcosystem…"
            detail="Confirm the factory call in your wallet."
          />
        )}
        {step.kind === "signing_minter" && (
          <ProgressPanel
            title="Authorizing mint delegate…"
            detail={
              <>
                Sign <code>setMinter</code> against your new realm{" "}
                <span className="font-mono">{shortAddress(step.ecosystem)}</span>
                . Authorizing slot #{step.signerIndex} ·{" "}
                <span className="font-mono">{shortAddress(step.signerAddress)}</span>.
              </>
            }
          />
        )}
        {step.kind === "registering" && (
          <ProgressPanel
            title="Registering realm metadata…"
            detail="Server is verifying on-chain ownership + minter authorization."
          />
        )}

        {step.kind === "error" && (
          <aside
            role="alert"
            className="rounded-md p-4 text-sm"
            style={{
              background: "rgba(255,80,80,0.10)",
              border: "1px solid rgba(255,80,80,0.35)",
              color: "#f99",
            }}
          >
            <strong>Deploy failed.</strong> {step.message}
            <div className="mt-3">
              <button
                type="button"
                onClick={onReset}
                className="rounded-md px-3 py-1.5 text-sm"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                }}
              >
                Back to form
              </button>
            </div>
          </aside>
        )}

        {step.kind === "done" && (
          <section
            aria-label="Deployment receipt"
            className="flex flex-col gap-3 rounded-md p-5 text-sm"
            style={{
              background: "rgba(80,200,120,0.06)",
              border: "1px solid rgba(80,200,120,0.30)",
            }}
          >
            <header className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Realm deployed</h2>
              <span className="text-[11px] uppercase tracking-widest opacity-70">
                Owner {address ? shortAddress(address) : ""}
              </span>
            </header>
            <p>
              Address: <span className="font-mono">{step.ecosystem}</span>
            </p>
            <p>
              Delegate: slot #{step.signerIndex} ·{" "}
              <span className="font-mono">{shortAddress(step.signerAddress)}</span>
            </p>
            <p>
              Max tier: T{step.maxTier}
            </p>
            <p className="opacity-70 break-all font-mono text-[11px]">
              tx {step.txHash}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/play/realm/${step.ecosystem}`}
                className="rounded-md px-3 py-1.5 text-sm transition"
                style={{
                  background: "var(--color-preset-bg, rgba(255,255,255,0.08))",
                  color: "var(--color-preset-fg, #fff)",
                  border:
                    "1px solid var(--color-preset-accent, rgba(255,255,255,0.18))",
                }}
              >
                Play your realm →
              </Link>
              <Link href="/" className="text-sm opacity-80 hover:opacity-100">
                Back to selector
              </Link>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function ProgressPanel({
  title,
  detail,
}: {
  title: string;
  detail: React.ReactNode;
}) {
  return (
    <aside
      aria-label={title}
      className="rounded-md p-4 text-sm"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 opacity-80 leading-relaxed">{detail}</p>
    </aside>
  );
}

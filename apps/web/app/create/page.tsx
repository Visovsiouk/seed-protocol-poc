"use client";

/**
 * `/create` — realm creation flow.
 *
 * Minimal-honest scope at this slice: `EcosystemFactory.createEcosystem()`
 * is a no-arg, user-signed call that mints a fresh `EcosystemTemplate`
 * clone and auto-registers it in `EcosystemRegistry`. Since the
 * registry is the only on-chain source of truth ("realms are
 * ecosystems"), there is no on-chain place to store a creator-chosen
 * name, preset, or bossId yet — so we don't pretend to collect them.
 *
 * After the tx confirms we route the user straight to
 * `/play/realm/[address]`, which runs the engine in trial mode
 * (fantasy flavor + Forest Hag stand-in) until on-chain preset
 * metadata lands.
 *
 * UI states (single canonical state machine):
 *   idle              → ready to sign
 *   signing           → wallet popup is open
 *   confirming        → tx broadcast, waiting on receipt
 *   done              → terminal success, render outcome card
 *   error             → terminal failure, render error + retry
 */

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useCreateEcosystem } from "@/lib/contracts/factory";

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "confirming" }
  | { kind: "done"; ecosystem: `0x${string}`; txHash: `0x${string}` }
  | { kind: "error"; message: string };

function shortAddress(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function CreatePage() {
  const { address } = useAccount();
  const { createEcosystem } = useCreateEcosystem();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const busy = status.kind === "signing" || status.kind === "confirming";

  const onDeploy = async () => {
    setStatus({ kind: "signing" });
    try {
      // The hook flips to "confirming" semantics after the wallet
      // resolves — we approximate the same in our local state by
      // bumping into "confirming" after writeContractAsync settles.
      // wagmi's `useWriteContract` doesn't expose intermediate states,
      // so we collapse signing+confirming for UI purposes: the button
      // disables for the whole window and the status text covers both.
      const result = await createEcosystem();
      setStatus({ kind: "done", ecosystem: result.ecosystem, txHash: result.txHash });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
    }
  };

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
          aria-label="Trial scope notice"
          className="rounded-md p-4 text-sm leading-relaxed"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <p>
            Deploying a realm clones the protocol&apos;s ecosystem
            template and registers it in <code>EcosystemRegistry</code>.
            Your wallet becomes the owner.
          </p>
          <p className="mt-2 opacity-80">
            On-chain preset / boss / cosmetic metadata isn&apos;t stored
            yet, so newly minted realms run in <strong>trial mode</strong>{" "}
            (fantasy flavor, no mint-to-chain). Players can still clear
            your realm&apos;s boss from the landing page.
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

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onDeploy}
            disabled={!address || busy || status.kind === "done"}
            className="self-start rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50"
            style={{
              background: "var(--color-preset-bg, rgba(255,255,255,0.08))",
              color: "var(--color-preset-fg, #fff)",
              border:
                "1px solid var(--color-preset-accent, rgba(255,255,255,0.18))",
            }}
          >
            {status.kind === "signing"
              ? "Sign in your wallet…"
              : status.kind === "confirming"
                ? "Waiting for confirmation…"
                : status.kind === "done"
                  ? "Realm deployed"
                  : "Deploy realm"}
          </button>

          {status.kind === "error" && (
            <aside
              role="alert"
              className="rounded-md p-3 text-sm"
              style={{
                background: "rgba(255,80,80,0.10)",
                border: "1px solid rgba(255,80,80,0.35)",
                color: "#f99",
              }}
            >
              <strong>Deploy failed.</strong> {status.message}
            </aside>
          )}
        </div>

        {status.kind === "done" && (
          <section
            aria-label="Deployment receipt"
            className="flex flex-col gap-3 rounded-md p-5 text-sm"
            style={{
              background: "rgba(80,200,120,0.06)",
              border: "1px solid rgba(80,200,120,0.30)",
            }}
          >
            <header className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">
                Realm deployed
              </h2>
              <span className="text-[11px] uppercase tracking-widest opacity-70">
                Owner {address ? shortAddress(address) : ""}
              </span>
            </header>
            <p>
              Address:{" "}
              <span className="font-mono">{status.ecosystem}</span>
            </p>
            <p className="opacity-70 break-all font-mono text-[11px]">
              tx {status.txHash}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/play/realm/${status.ecosystem}`}
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
              <Link
                href="/"
                className="text-sm opacity-80 hover:opacity-100"
              >
                Back to selector
              </Link>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

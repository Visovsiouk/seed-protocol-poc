"use client";

/**
 * `<RoyaltyEarnedDemo/>`.
 *
 * The "see your realm earn its first royalty" orchestrated four-tx flow
 * that lives on `/realm/[address]` for the realm's owner. The whole point
 * is to make claim #4 — "creators earn royalties forever" — *felt* rather
 * than *shown*: the visitor's own wallet receives the 4.5% creator share
 * on the buy-back, with an on-chain receipt they can revisit.
 *
 * UX sequence (visible to the user as 4 steps):
 *   1. Mint a test loot into the realm. `mintAsset` is `onlyOwner`, so
 *      this works precisely because the viewer === the realm's owner.
 *   2. Sell to the Wandering Trader. We list from the visitor's wallet
 *      then call `/api/trader/buy`. Visitor sees 95% (seller) + 4.5%
 *      (creator royalty) land back, because they are both seller and
 *      creator on this first sale.
 *   3. Trader re-lists. Server-signed call to `/api/trader/list`.
 *   4. Visitor buys it back. The creator royalty (4.5%) routes to the
 *      visitor — they are still the realm's owner — *while paying the
 *      list price* to the Trader as seller. Net cost ≈ 0.5% treasury
 *      slice + gas. This is the felt-royalty moment.
 *
 * Precondition: the realm must have at least one registered schema in
 * `ownedSchemas` — `mintAsset.extensionSchemaId` cannot be a never-
 * registered id. The component reads `ownedSchemas(0)` defensively and
 * surfaces a "register a loot schema first" notice when it reverts (e.g.
 * a fresh creator clone, before the inline signature-schema
 * flow has been used). The wiring still lands; only the preconditions
 * gate execution.
 */

import { useCallback, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, parseEther } from "viem";
import { ecosystemTemplateAbi } from "@abis/generated";
import {
  computeFeeBreakdown,
  useExchangeApproval,
  useList,
  usePurchase,
} from "@/lib/contracts/exchange";
import { traderBuy, traderList } from "@/lib/trader-client";
import {
  buildLootMetadataURI,
  deriveLootTokenId,
} from "@/lib/contracts/loot-derive";
import { evocativeName } from "@/lib/loot/names";
import { fallbackSeed } from "@/lib/engine/runtime";
import { queryKeys } from "@/lib/reads/cache";
import type { LootRoll, Preset } from "@/lib/engine/types";

const DEMO_PRICE = parseEther("0.005");
const DEMO_TIER_ONCHAIN = 0; // SeedTypes.Tier.T1 == 0
const DEMO_DEPTH = 1;

type StepKey = "mint" | "tradeIn" | "relist" | "buyback";
type StepStatus = "idle" | "pending" | "done" | "error";

type StepRecord = {
  status: StepStatus;
  txHash?: `0x${string}`;
  detail?: string;
  error?: string;
};

type StepsState = Record<StepKey, StepRecord>;

const INITIAL_STEPS: StepsState = {
  mint: { status: "idle" },
  tradeIn: { status: "idle" },
  relist: { status: "idle" },
  buyback: { status: "idle" },
};

type Props = {
  realm: `0x${string}`;
  /**
   * Preset used purely for metadata flavor (loot name + trait labels).
   * Creator realms without on-chain preset metadata pass "fantasy" as a
   * trial-mode default — the on-chain mint doesn't care what name is
   * baked into the JSON.
   */
  preset: Preset;
  realmLabel: string;
};

export function RoyaltyEarnedDemo({ realm, preset, realmLabel }: Props) {
  const { address: viewer } = useAccount();
  const publicClient = usePublicClient();
  const qc = useQueryClient();

  const approval = useExchangeApproval();
  const { list } = useList();
  const { purchase } = usePurchase();
  const { writeContractAsync } = useWriteContract();

  const [steps, setSteps] = useState<StepsState>(INITIAL_STEPS);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [visitorListingId, setVisitorListingId] = useState<bigint | null>(null);
  const [traderListingId, setTraderListingId] = useState<bigint | null>(null);
  const [royaltyEarned, setRoyaltyEarned] = useState<bigint>(0n);

  // First-registered schema on this realm. `ownedSchemas(0)` reverts on a
  // fresh clone — we surface that as a precondition rather than letting
  // step 1 explode in the user's face. Read once per realm.
  const schemaQuery = useQuery({
    queryKey: ["realm-owned-schema-0", realm],
    enabled: !!publicClient,
    staleTime: Infinity,
    queryFn: async (): Promise<bigint | null> => {
      if (!publicClient) return null;
      try {
        const id = (await publicClient.readContract({
          address: realm,
          abi: ecosystemTemplateAbi,
          functionName: "ownedSchemas",
          args: [0n],
        })) as bigint;
        return id;
      } catch {
        return null;
      }
    },
  });

  const fees = useMemo(() => computeFeeBreakdown(DEMO_PRICE), []);

  const setStep = useCallback((key: StepKey, patch: Partial<StepRecord>) => {
    setSteps((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // ---- Step 1: mint -------------------------------------------------------
  const runMint = useCallback(async () => {
    if (!viewer || !publicClient) return;
    const extensionSchemaId = schemaQuery.data;
    if (!extensionSchemaId || extensionSchemaId === 0n) return;

    setStep("mint", { status: "pending", error: undefined });
    try {
      const runSeed = fallbackSeed();
      const nameSeed = BigInt(`0x${runSeed.slice(2, 18)}`);

      // Demo loot is a fixed T1 weapon — pick a preset-native sword/axe/etc
      // so the schema-native name ladder resolves. Cyberpunk has no
      // "sword", so the per-preset default lives in `DEMO_WEAPON_TYPE`.
      const demoWeaponType =
        preset === "fantasy" ? "sword" : preset === "scifi" ? "rifle" : "katana";

      const loot: LootRoll = {
        tier: 1,
        slot: "weapon",
        schemaId: Number(extensionSchemaId),
        damageDie: 6,
        attackBonus: 1,
        catalogEffects: [],
        nameSeed,
        extraFields: {},
        weaponType: demoWeaponType,
      };

      const newTokenId = deriveLootTokenId({
        realm,
        runSeed,
        depth: DEMO_DEPTH,
        nameSeed,
      });
      const assembledName = evocativeName(nameSeed, 1, loot.element);
      const metadataURI = buildLootMetadataURI({
        loot,
        preset,
        realmLabel,
        assembledName,
      });

      const hash = await writeContractAsync({
        address: realm,
        abi: ecosystemTemplateAbi,
        functionName: "mintAsset",
        args: [
          viewer,
          newTokenId,
          1n,
          {
            tier: DEMO_TIER_ONCHAIN,
            extensionSchemaId,
            metadataURI,
          },
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      setTokenId(newTokenId);
      setStep("mint", {
        status: "done",
        txHash: hash,
        detail: `Token #${newTokenId.toString().slice(0, 8)}…`,
      });
      qc.invalidateQueries({ queryKey: queryKeys.inventoryCards(viewer) });
    } catch (e) {
      setStep("mint", {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [
    viewer,
    publicClient,
    schemaQuery.data,
    preset,
    realm,
    realmLabel,
    setStep,
    writeContractAsync,
    qc,
  ]);

  // ---- Step 2: visitor lists → trader buys --------------------------------
  const runTradeIn = useCallback(async () => {
    if (!tokenId || !viewer) return;
    setStep("tradeIn", { status: "pending", error: undefined });
    try {
      // Auto-approve happens inside useList(); explicit check just keeps
      // the user-facing text honest if a wallet popup is about to appear.
      const approved = await approval.check();
      if (!approved) {
        await approval.approve();
      }

      const listResult = await list({
        tokenId,
        amount: 1n,
        price: DEMO_PRICE,
      });
      setVisitorListingId(listResult.listingId);

      const buyResp = await traderBuy(listResult.listingId);
      if (!buyResp.ok) {
        throw new Error(`trader buy failed: ${buyResp.message}`);
      }

      // First-sale earnings: visitor receives both seller proceeds and
      // creator royalty (they are both, on this mint).
      setRoyaltyEarned((prev) => prev + fees.creator);
      setStep("tradeIn", {
        status: "done",
        txHash: buyResp.txHash,
        detail: `+${formatEther(fees.seller + fees.creator)} ETH to you (seller + creator)`,
      });
    } catch (e) {
      setStep("tradeIn", {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [tokenId, viewer, approval, list, fees, setStep]);

  // ---- Step 3: trader re-lists --------------------------------------------
  const runRelist = useCallback(async () => {
    if (!tokenId) return;
    setStep("relist", { status: "pending", error: undefined });
    try {
      const resp = await traderList(tokenId, 1n, DEMO_PRICE);
      if (!resp.ok) {
        throw new Error(`trader list failed: ${resp.message}`);
      }
      const listingIdStr = (resp.extra as { listingId?: string } | undefined)
        ?.listingId;
      if (!listingIdStr) {
        throw new Error("trader list succeeded but no listingId returned");
      }
      const newListingId = BigInt(listingIdStr);
      setTraderListingId(newListingId);
      setStep("relist", {
        status: "done",
        txHash: resp.txHash,
        detail: `Listing #${listingIdStr}`,
      });
    } catch (e) {
      setStep("relist", {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [tokenId, setStep]);

  // ---- Step 4: visitor buys back ------------------------------------------
  const runBuyback = useCallback(async () => {
    if (!traderListingId) return;
    setStep("buyback", { status: "pending", error: undefined });
    try {
      const result = await purchase({
        listingId: traderListingId,
        price: DEMO_PRICE,
      });
      // Second sale: visitor pays full price but the creator share routes
      // back to them (still the realm owner). Net cost ≈ treasury + gas.
      setRoyaltyEarned((prev) => prev + fees.creator);
      setStep("buyback", {
        status: "done",
        txHash: result.txHash,
        detail: `+${formatEther(fees.creator)} ETH creator royalty back to you`,
      });
    } catch (e) {
      setStep("buyback", {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [traderListingId, purchase, fees, setStep]);

  const resetDemo = useCallback(() => {
    setSteps(INITIAL_STEPS);
    setTokenId(null);
    setVisitorListingId(null);
    setTraderListingId(null);
    setRoyaltyEarned(0n);
  }, []);

  const stepsOrder: { key: StepKey; title: string; run: () => Promise<void> }[] = [
    { key: "mint", title: "Mint a test loot", run: runMint },
    { key: "tradeIn", title: "Sell to the Wandering Trader", run: runTradeIn },
    { key: "relist", title: "Trader re-lists it", run: runRelist },
    { key: "buyback", title: "Buy it back — earn your royalty", run: runBuyback },
  ];

  const allDone = stepsOrder.every((s) => steps[s.key].status === "done");
  const anyPending = stepsOrder.some((s) => steps[s.key].status === "pending");

  const schemaReady = schemaQuery.data !== null && schemaQuery.data !== 0n;

  return (
    <section
      aria-label="Royalty earned demo"
      className="flex flex-col gap-4 rounded-md p-5"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,217,122,0.08), rgba(255,255,255,0.02))",
        border: "1px solid rgba(255,217,122,0.30)",
      }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "#ffd97a" }}
          >
            Value-flow demo · §7.5b
          </span>
          <h2 className="text-base font-semibold">
            See {realmLabel} earn its first royalty
          </h2>
        </div>
        <span className="text-[11px] opacity-60 tabular-nums">
          Cycle price · {formatEther(DEMO_PRICE)} ETH
        </span>
      </header>

      <p className="text-xs opacity-75 leading-relaxed">
        Four orchestrated transactions: mint a test loot, sell it to the
        Wandering Trader, the Trader re-lists, you buy it back. On that
        last buy, the 4.5% creator share routes to your wallet — because
        the loot was minted in {realmLabel}, you own the realm, and
        royalties follow the realm forever.
      </p>

      {schemaQuery.isLoading && (
        <p className="text-xs opacity-60">Checking realm schemas…</p>
      )}

      {!schemaQuery.isLoading && !schemaReady && (
        <aside
          className="rounded-md p-3 text-xs leading-relaxed"
          style={{
            background: "rgba(255,196,0,0.08)",
            border: "1px solid rgba(255,196,0,0.30)",
            color: "#f0c860",
          }}
        >
          This realm has no registered loot schema yet. Register a schema
          on the realm (Phase 5a inline flow) before running the demo —
          <code className="font-mono"> mintAsset</code> needs a real{" "}
          <code className="font-mono">extensionSchemaId</code>.
        </aside>
      )}

      <ol className="flex flex-col gap-2">
        {stepsOrder.map((s, idx) => {
          const rec = steps[s.key];
          const prevDone = idx === 0 || steps[stepsOrder[idx - 1].key].status === "done";
          const canRun =
            schemaReady &&
            prevDone &&
            rec.status !== "done" &&
            !anyPending &&
            !!viewer;
          return (
            <li
              key={s.key}
              className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-3 px-3 py-2 rounded"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <span
                className="text-[10px] tabular-nums opacity-60"
                aria-hidden
              >
                {idx + 1}.
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium">{s.title}</span>
                {rec.detail && (
                  <span className="text-[11px] opacity-70">{rec.detail}</span>
                )}
                {rec.error && (
                  <span className="text-[11px]" style={{ color: "#f77" }}>
                    {rec.error}
                  </span>
                )}
                {rec.txHash && (
                  <span className="text-[10px] opacity-50 font-mono">
                    tx {rec.txHash.slice(0, 10)}…{rec.txHash.slice(-6)}
                  </span>
                )}
              </div>
              <StatusBadge
                status={rec.status}
                onRun={s.run}
                disabled={!canRun}
              />
            </li>
          );
        })}
      </ol>

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-widest opacity-50">
            Royalty earned
          </span>
          <span
            className="text-base font-semibold tabular-nums"
            style={{ color: allDone ? "#ffd97a" : undefined }}
          >
            {formatEther(royaltyEarned)} ETH
          </span>
        </div>
        {allDone && (
          <button
            type="button"
            onClick={resetDemo}
            className="rounded-md px-3 py-1.5 text-xs transition"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Run again
          </button>
        )}
      </footer>
    </section>
  );
}

function StatusBadge({
  status,
  onRun,
  disabled,
}: {
  status: StepStatus;
  onRun: () => void;
  disabled: boolean;
}) {
  if (status === "done") {
    return (
      <span
        className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
        style={{
          background: "rgba(80,200,120,0.12)",
          color: "#7ed99a",
          border: "1px solid rgba(80,200,120,0.35)",
        }}
      >
        Done
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="text-[10px] uppercase tracking-widest opacity-70">
        Working…
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={disabled}
      className="rounded-md px-2.5 py-1 text-[11px] transition disabled:opacity-40"
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      {status === "error" ? "Retry" : "Run"}
    </button>
  );
}

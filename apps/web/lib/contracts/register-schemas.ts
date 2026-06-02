"use client";

/**
 * `useRegisterRealmSchemas` — the 4th signature in the `/create` flow.
 *
 * Starter realms have their `clearReceipt` + `loot` schema pair registered
 * on-chain by the seeder; player realms used to *borrow* the starter pair
 * for their preset (so a player realm's receipts pointed at a schema the
 * starter realm owned — muddy provenance). This hook lets a player realm
 * register its *own* pair against its fresh clone, so every asset it mints
 * is gated by a schema `createdByEcosystem == thisRealm`.
 *
 * Both calls are owner-signed (`registerSchema` is owner-only on the
 * template) against the just-deployed clone, sequenced after
 * `createEcosystem` and before `setMinter`. The field shapes come from the
 * shared `SCHEMAS` definitions — the exact shapes the mint routes fill —
 * so no field is invented that nothing writes.
 *
 * Returns the two schema IDs (as `bigint`) decoded from each tx's
 * `SchemaRegistered` event; the caller serializes them to decimal strings
 * for `POST /api/realm/register`.
 */

import { useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { ecosystemTemplateAbi } from "@abis/generated";
import { SCHEMAS } from "./schemas";
import { parseSchemaRegistered } from "./schema-register-parse";

export type RealmSchemaIds = {
  clearReceipt: bigint;
  loot: bigint;
};

export function useRegisterRealmSchemas() {
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const registerRealmSchemas = useCallback(
    async (realm: `0x${string}`): Promise<RealmSchemaIds> => {
      if (!publicClient) throw new Error("No public client");

      const registerOne = async (
        def: { name: string; metadataURI: string; fields: unknown },
        label: string,
      ): Promise<bigint> => {
        const hash = await writeContractAsync({
          address: realm,
          abi: ecosystemTemplateAbi,
          functionName: "registerSchema",
          args: [
            def.name,
            def.metadataURI,
            def.fields as never,
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error(`registerSchema(${label}) reverted (tx ${hash})`);
        }
        const schemaId = parseSchemaRegistered(receipt.logs, realm);
        if (schemaId === null) {
          throw new Error(
            `registerSchema(${label}) succeeded but no SchemaRegistered event found`,
          );
        }
        return schemaId;
      };

      // Order matches the seeder (clearReceipt then loot) for parity, but
      // schema IDs are global-monotonic so the binding is per-tx, not
      // positional — we read each id from its own receipt.
      const clearReceipt = await registerOne(SCHEMAS.clearReceipt, "clearReceipt");
      const loot = await registerOne(SCHEMAS.loot, "loot");

      return { clearReceipt, loot };
    },
    [publicClient, writeContractAsync],
  );

  return { registerRealmSchemas, isPending, error };
}

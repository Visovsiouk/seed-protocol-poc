import "server-only";

import { NextResponse } from "next/server";

import { derivePlayerRealmSignerAddress } from "@/lib/server/realm-signer";
import { getNextSignerIndex } from "@/lib/server/realm-db";

/**
 * `GET /api/realm/next-signer`
 *
 * The `/create` flow calls this *after* `createEcosystem()` confirms
 * and *before* asking the player to sign `setMinter(...)`. We need to
 * tell the player two things at once:
 *
 *   1. Which BIP-44 index the server will use for this realm
 *      (`signerIndex` — stable for the lifetime of this realm)
 *   2. The derived address (`signerAddress`) — so the player sees what
 *      they're authorizing in the wallet popup before they sign
 *
 * This route does NOT reserve the index. The slot is only claimed when
 * `POST /api/realm/register` inserts the row — that's where the UNIQUE
 * constraint on `signer_index` fires. So two concurrent /create flows
 * may briefly see the same `nextIndex`; whichever inserts first wins
 * and the other gets a 409 and has to retry with the next slot.
 *
 * This is a read-only public endpoint. No auth.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const index = getNextSignerIndex();
    const address = derivePlayerRealmSignerAddress(index);
    return NextResponse.json({ ok: true as const, signerIndex: index, signerAddress: address });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false as const,
        reason: "derive_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

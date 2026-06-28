import { handleFaucet } from "@/lib/faucet-server";

/**
 * POST /api/faucet — fund a connected real wallet on the local anvil chain.
 * All guarding (chain gate, rate limit, body validation) lives in
 * `handleFaucet`. See lib/faucet-server.
 */
export const POST = handleFaucet;

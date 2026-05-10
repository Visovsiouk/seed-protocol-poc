import { createPublicClient, http } from "viem";
import { activeChain, rpcUrl } from "@/lib/chain";

/**
 * Singleton viem public client used by every browser-side read in `lib/reads/*`.
 * Created eagerly at module load — viem clients are cheap and isomorphic,
 * and lazy-init was triggering pnpm's two-viem-version type collision.
 */
export const readClient = createPublicClient({
  chain: activeChain,
  transport: http(rpcUrl),
});

export function getReadClient() {
  return readClient;
}

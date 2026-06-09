import "server-only";

/**
 * Per-signer serialization of the `read-nonce → broadcast` critical
 * section.
 *
 * `/api/realm/mint-loot` and `/api/realm/boss-cleared` both sign
 * `mintAsset` from the same realm-owner / player-realm delegate key.
 * At end-of-descent the client fires the loot batch and the boss
 * clear-receipt mint near-simultaneously. Each route independently runs
 *
 *     nonce = getTransactionCount(pending)
 *     writeContract({ ..., nonce })
 *
 * and nothing makes that pair atomic across routes. Two requests that
 * read the pending nonce before either has broadcast both get the same
 * value; the first broadcast lands, the second reverts "nonce too low".
 * `blockTag: "pending"` does not help — it only reflects txs already in
 * the mempool, not a sibling request still between its own read and
 * broadcast.
 *
 * This is a single-process, in-memory mutex. Both routes execute in the
 * same Next.js `nodejs` runtime and share the cached keyring singleton
 * (`realm-signer.ts`), so module-level state is shared across them. The
 * queue is keyed on the lowercased signer address: distinct keys (admin,
 * three starter owners, per-realm delegates) run in parallel; calls that
 * share a key are forced to run one at a time.
 *
 * NOT durable across a process restart or multiple server instances. A
 * horizontally-scaled deployment would need each signer key pinned to a
 * single instance, or an on-chain/Redis nonce allocator. For the PoC's
 * single Next.js process this fully closes the race.
 */

// One tail promise per signer address. Each new task chains off the
// previous tail so the bodies run strictly in submission order.
const tails = new Map<string, Promise<unknown>>();

const swallow = () => {};

/**
 * Run `task` with exclusive access to `signerAddress`. Tasks queued for
 * the same address execute sequentially in call order; different
 * addresses do not block one another.
 *
 * Hold the lock only for as long as the nonce must stay reserved — i.e.
 * the `getTransactionCount` read plus the `writeContract` broadcast.
 * Once `writeContract` resolves the tx is in the mempool, so the next
 * task's `pending` read will observe the consumed nonce. Receipt waiting
 * (`waitForTransactionReceipt`) must stay OUTSIDE the lock so a slow
 * confirmation doesn't stall sibling mints.
 *
 * A rejected task does not poison the queue: the stored tail swallows
 * errors, while the original rejection still propagates to this caller.
 */
export function withSignerLock<T>(
  signerAddress: `0x${string}`,
  task: () => Promise<T>,
): Promise<T> {
  const key = signerAddress.toLowerCase();
  const prev = tails.get(key) ?? Promise.resolve();

  // Run `task` after `prev` settles, regardless of whether it fulfilled
  // or rejected (`prev.then(task, task)` invokes `task` on both arms).
  const result = prev.then(task, task);

  // Advance the tail with an error-tolerant copy so one failure can't
  // break the chain for later callers.
  tails.set(key, result.then(swallow, swallow));

  return result;
}

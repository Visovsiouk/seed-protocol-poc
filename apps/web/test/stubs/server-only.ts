/**
 * Test stub for the `server-only` package.
 *
 * `server-only` exists to make a build fail if a server module is pulled into
 * a client bundle: its default export throws on import, and only the
 * `react-server` export condition resolves to a no-op. Vitest does not set
 * that condition, so `import "server-only"` throws during collection and any
 * module carrying it — every route handler, `realm-guards`, `trader-server` —
 * was untestable.
 *
 * Aliased in `vitest.config.ts`. A targeted alias is deliberate: adding
 * `react-server` to `resolve.conditions` would also change how React, Next and
 * other packages resolve (React's react-server entry drops client hooks, for
 * one), so a global condition flip risks breaking unrelated tests to fix an
 * unrelated problem. This swaps exactly the one module that is in the way.
 *
 * The production guarantee is untouched: the real package is still what Next
 * resolves during `next build`, which is where the protection matters.
 */
export {};

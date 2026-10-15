import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

/**
 * ESLint flat config, replacing `.eslintrc.json` + `next lint`.
 *
 * `next lint` is deprecated and is removed in Next.js 16, so the `lint` script
 * now invokes the ESLint CLI directly. Flat config is ESLint 9's default and
 * the only format ESLint 10 will accept.
 *
 * `eslint-config-next@15` still ships eslintrc-style presets only — it has no
 * flat-config entry point (that lands with Next 16) — so `FlatCompat` bridges
 * the two. That keeps the rule set byte-identical to what `next lint` applied,
 * which is the point: this change is a migration, not a retune. When the repo
 * moves to Next 16, `compat.extends(...)` can collapse into a direct import of
 * the config's own flat export and this file loses its only dependency.
 *
 * The preset bundles its own plugins (@next/eslint-plugin-next,
 * typescript-eslint, react, react-hooks, jsx-a11y, import), so none of those
 * need declaring here.
 */

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

// Named rather than exported inline to satisfy the preset's own
// `import/no-anonymous-default-export`.
const config = [
  {
    // `next lint` implicitly skipped build output and only walked the source
    // directories. The CLI walks everything it is pointed at, so the
    // equivalent exclusions have to be explicit — otherwise generated and
    // vendored code gets linted as if it were hand-written.
    ignores: [
      ".next/**",
      "coverage/**",
      "out/**",
      // Runtime sqlite + wagmi codegen output. Both gitignored.
      "data/**",
      "lib/contracts/generated/**",
      // Next.js writes this; it is not ours to lint.
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;

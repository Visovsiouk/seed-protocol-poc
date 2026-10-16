import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@abis": path.resolve(__dirname, "../../packages/abis"),
      // `import "server-only"` throws unless the `react-server` export
      // condition is set, which vitest does not set — so every route handler
      // and server lib carrying it failed at collection time. Stub it out.
      // See test/stubs/server-only.ts for why this is an alias rather than a
      // global `resolve.conditions` change.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});

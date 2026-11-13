import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The website's live AI test (S5b) only: `pnpm --filter @vabrato/web test:live`.
// Not loaded by the root workspace (vitest.workspace.ts matches
// vitest.config.ts only), so `pnpm test` and CI never run it; the test also
// refuses to run when CI is set.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/live/**/*.live.ts"],
    testTimeout: 5 * 15 * 60_000,
    hookTimeout: 60_000,
    retry: 0,
    fileParallelism: false,
    sequence: { concurrent: false },
    env: { TZ: "America/Los_Angeles" },
  },
});

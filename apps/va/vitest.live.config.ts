import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The live AI test (S6b PR 9) only: `pnpm --filter va test:live`. Not loaded by
// the root workspace (vitest.workspace.ts matches vitest.config.ts only), so
// `pnpm test` and CI never run it; the test also refuses to run when CI is set.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/live/**/*.live.ts"],
    // One test runs the 20 calls in order; each call has the SDK's 10-minute request timeout and no retries.
    testTimeout: 20 * 15 * 60_000,
    hookTimeout: 60_000,
    retry: 0,
    fileParallelism: false,
    sequence: { concurrent: false },
    env: { TZ: "America/Los_Angeles" },
  },
});

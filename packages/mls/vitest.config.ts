import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Sync tests start an in-process Postgres (PGlite) with every migration.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The app's "@/..." imports, so tests can load server actions.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The live AI test has its own config and never runs here (S6b PR 9).
    exclude: ["src/live/**", "node_modules/**"],
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same JSX runtime as Next (no React import needed in components).
  esbuild: { jsx: "automatic" },
  // Same "@/..." path alias as tsconfig.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The live AI test has its own config (vitest.live.config.ts) and never runs here.
    // Its decisions (src/live/judge.ts) are tested here, without a model.
    exclude: ["src/live/**/*.live.ts", "node_modules/**"],
  },
});

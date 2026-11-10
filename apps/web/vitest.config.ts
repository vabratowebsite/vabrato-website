import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same JSX runtime as Next (no React import needed in components).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

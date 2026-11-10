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
  },
});

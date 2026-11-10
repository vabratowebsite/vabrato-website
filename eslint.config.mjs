import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**", "packages/db/src/types.gen.ts", "**/next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    settings: { next: { rootDir: ["apps/*/"] } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // MLS-7: FULL MLS data never leaves the agent console (apps/va).
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    ignores: ["apps/va/**", "packages/mls/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@vabrato/mls/full", message: "FULL MLS data is agent-console only (SPEC MLS-7)." }],
          patterns: [{ group: ["**/mls/src/levels/full*", "**/mls/src/full*"], message: "FULL MLS data is agent-console only (SPEC MLS-7)." }],
        },
      ],
    },
  },
];

export default config;

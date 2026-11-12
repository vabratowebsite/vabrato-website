import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const MLS_FULL_PATH = { name: "@vabrato/mls/full", message: "FULL MLS data is agent-console only (SPEC MLS-7)." };
const MLS_FULL_PATTERN = { group: ["**/mls/src/levels/full*", "**/mls/src/full*"], message: "FULL MLS data is agent-console only (SPEC MLS-7)." };
const ANTHROPIC_SDK_PATH = { name: "@anthropic-ai/sdk", message: "Model calls go through @vabrato/ai (SPEC <ai_rules>)." };

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
  // Restricted imports. ESLint keeps only the last matching "no-restricted-imports"
  // entry per file, so each group of files gets its full list here.
  //   MLS-7: FULL MLS data never leaves the agent console (apps/va).
  //   SPEC <ai_rules>: only packages/ai talks to the model.
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    ignores: ["apps/va/**", "packages/mls/**", "packages/ai/**"],
    rules: { "no-restricted-imports": ["error", { paths: [MLS_FULL_PATH, ANTHROPIC_SDK_PATH], patterns: [MLS_FULL_PATTERN] }] },
  },
  {
    files: ["apps/va/**/*.{ts,tsx,js,mjs,cjs}", "packages/mls/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: { "no-restricted-imports": ["error", { paths: [ANTHROPIC_SDK_PATH] }] },
  },
  {
    files: ["packages/ai/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: { "no-restricted-imports": ["error", { paths: [MLS_FULL_PATH], patterns: [MLS_FULL_PATTERN] }] },
  },
];

export default config;

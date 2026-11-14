import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Integrations PR 1: connected-account code (tokens, node:crypto) stays on
// the console's server. These scans keep it that way as features are added.

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

function* sourceFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) yield path;
  }
}
const files = ["apps", "packages", "scripts"].flatMap((d) => [...sourceFiles(join(ROOT, d))]).map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, "utf8") }));

describe("connected-account guardrails", () => {
  it("@vabrato/lib/integrations is used only on the console's server", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f.file.startsWith("packages/lib/src/integrations/") || !/["']@vabrato\/lib\/integrations(?:\/[^"']*)?["']/.test(f.text)) continue;
      if (!f.file.startsWith("apps/va/src/") && !f.file.startsWith("scripts/qa/")) bad.push(`${f.file}: outside the console`);
      if (/^\s*["']use client["']/m.test(f.text)) bad.push(`${f.file}: client component`);
    }
    expect(bad).toEqual([]);
  });

  it("the main @vabrato/lib entry doesn't export the integration code", () => {
    const index = readFileSync(join(ROOT, "packages/lib/src/index.ts"), "utf8");
    expect(index).not.toMatch(/integrations/);
  });

  it("the token key, the OAuth secrets and the picker key never get a browser-visible name", () => {
    // The picker's browser key reaches the page only through a server action, for staff who may import.
    const hits = files.filter((f) => /NEXT_PUBLIC_[A-Z_]*(INTEGRATION|GOOGLE_INTEGRATION|TOKEN_KEY|DROPBOX|PICKER|GOOGLE_CLOUD)/.test(f.text)).map((f) => f.file);
    expect(hits.filter((f) => !f.endsWith("guard.test.ts"))).toEqual([]);
  });

  it("the fake Google and Dropbox are used only by tests and QA", () => {
    const users = files.filter((f) => /integrations\/fake-(google|dropbox|files)(\.ts)?["']/.test(f.text) && !f.file.startsWith("packages/lib/src/integrations/")).map((f) => f.file);
    expect(users.filter((f) => !f.startsWith("scripts/qa/") && !/\.test\.tsx?$/.test(f))).toEqual([]);
  });
});

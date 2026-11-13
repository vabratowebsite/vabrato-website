import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SPEC <ai_rules>: model calls happen only in server-side packages/ai, and
// AI is not on signed-out public pages. These scans keep that true as
// features are added.

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
const all = () => ["apps", "packages", "scripts"].flatMap((d) => [...sourceFiles(join(ROOT, d))]).map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, "utf8") }));
const imports = (text: string, pkg: string) => new RegExp(`(?:from|import|require\\()\\s*["']${pkg}(?:/[^"']*)?["']`).test(text);

describe("AI guardrails in the codebase", () => {
  const files = all();

  it("only packages/ai/src/anthropic.ts imports the Anthropic SDK", () => {
    const users = files.filter((f) => imports(f.text, "@anthropic-ai/sdk")).map((f) => f.file);
    expect(users).toEqual(["packages/ai/src/anthropic.ts"]);
  });

  it("@vabrato/ai is used only from the member portal and the agent console, on the server", () => {
    const allowed = [/^apps\/va\/src\//, /^apps\/web\/src\/member\//, /^apps\/web\/src\/app\/my\//, /^apps\/web\/src\/app\/api\/my\//, /^apps\/web\/src\/live\//, /^packages\/ai\//];
    const bad: string[] = [];
    for (const f of files) {
      if (!imports(f.text, "@vabrato/ai")) continue;
      if (!allowed.some((re) => re.test(f.file))) bad.push(`${f.file}: outside /my and the console`);
      if (/^\s*["']use client["']/m.test(f.text)) bad.push(`${f.file}: client component`);
    }
    expect(bad).toEqual([]);
  });

  it("@vabrato/ai/live (the live test's helpers) is used only by the live tests", () => {
    const users = files.filter((f) => /["']@vabrato\/ai\/live["']/.test(f.text) && !f.file.endsWith("guard.test.ts")).map((f) => f.file);
    expect(users.filter((f) => !/^apps\/(va|web)\/src\/live\/[^/]+\.live\.ts$/.test(f) && !f.startsWith("packages/ai/"))).toEqual([]);
  });

  it("the API key is never exposed to the browser", () => {
    const hits = files.filter((f) => /NEXT_PUBLIC_[A-Z_]*ANTHROPIC|NEXT_PUBLIC_[A-Z_]*CLAUDE/.test(f.text)).map((f) => f.file);
    expect(hits.filter((f) => !f.endsWith("guard.test.ts"))).toEqual([]);
  });

  it("the Claude client uses nothing that stores data at Anthropic (Zero Data Retention)", () => {
    // Code only: the file's comments explain what it avoids.
    const client = readFileSync(join(ROOT, "packages/ai/src/anthropic.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    // No Files API, message threads, batches, code execution containers or stored memory.
    expect(client).not.toMatch(/\.files\.|file_id|thread|batches|code_execution|memory_|container/);
    // No tools at all: the model can only write.
    expect(client).not.toMatch(/\btools\s*:/);
  });

  it("every feature's flag follows ai_<feature> and ships off", () => {
    const dir = join(ROOT, "packages/db/supabase/migrations");
    const bad: string[] = [];
    for (const name of readdirSync(dir)) {
      const sql = readFileSync(join(dir, name), "utf8");
      for (const m of sql.matchAll(/\(\s*'(ai_[a-z0-9_]+)'\s*,\s*'[^']*'\s*(?:,\s*(true|false))?\s*\)/g)) {
        if (m[1] !== "ai_enabled" && !/^ai_(staff|member)_[a-z0-9_]{2,40}$/.test(m[1]!)) bad.push(`${name}: ${m[1]} isn't ai_staff_* or ai_member_*`);
        if (m[2] === "true") bad.push(`${name}: ${m[1]} ships enabled`);
      }
    }
    expect(bad).toEqual([]);
  });
});

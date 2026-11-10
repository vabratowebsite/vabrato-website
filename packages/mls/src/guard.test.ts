import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// MLS-7: FULL data never leaves the agent console. Outside apps/va (and this
// package) nothing may import the FULL projections or read the FULL tables.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
// packages/db is not scanned: it describes every table (generated types),
// which is schema, not data access.
const SCANNED = ["apps/web", "apps/buyer", "apps/seller", "apps/mobile", "packages/ui", "packages/lib"];
const FORBIDDEN = [/@vabrato\/mls\/full/, /mls\/src\/(levels\/)?full/, /\bmls_listing_full\b/, /\bmls_members\b/, /\bprojectFull\b/, /\bprojectMember\b/];

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

describe("FULL data stays in the agent console (MLS-7)", () => {
  it("no code outside apps/va references FULL projections or tables", () => {
    const hits: string[] = [];
    for (const dir of SCANNED) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${relative(ROOT, file)}: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("ESLint rejects importing @vabrato/mls/full from apps/web", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const [result] = await eslint.lintText(`import { projectFull } from "@vabrato/mls/full";\nexport const x = projectFull;\n`, {
      filePath: join(ROOT, "apps/web/src/lib/guard-probe.ts"),
    });
    expect(result!.messages.map((m) => m.ruleId)).toContain("no-restricted-imports");
  });

  it("ESLint allows it in the agent console", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const [result] = await eslint.lintText(`import { projectFull } from "@vabrato/mls/full";\nexport const x = projectFull;\n`, {
      filePath: join(ROOT, "apps/va/src/lib/guard-probe.ts"),
    });
    expect(result!.messages.filter((m) => m.ruleId === "no-restricted-imports")).toEqual([]);
  });
});

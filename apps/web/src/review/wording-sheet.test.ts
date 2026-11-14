import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_AI_FEATURES } from "@vabrato/lib";
import { PAGE_NOTES, SHEET_PATH, buildWordingSheet, modeHints, plain, repairWording } from "./wording-sheet";

// Mark's wording sheet (S5b PR 7) stays in step with the code. After changing
// member-facing wording, regenerate it: UPDATE_WORDING=1 pnpm --filter @vabrato/web test wording

const REPO = resolve(dirname(SHEET_PATH), "../..");

describe("Mark's wording sheet", () => {
  it("every page note is still in its file", () => {
    for (const [where, file, text] of PAGE_NOTES) expect(plain(readFileSync(resolve(REPO, file), "utf8")), `${where}: ${text}`).toContain(plain(text));
  });

  it("lists every Ask Vabrato mode, and the repair wording waiting for Mark", () => {
    expect(modeHints().map((m) => m.label)).toHaveLength(MEMBER_AI_FEATURES.length);
    expect(repairWording().map((r) => r.name)).toEqual(["FORM_GOVERNS", "REPAIR_WORDING"]);
  });

  it("the committed sheet matches the code", () => {
    const sheet = buildWordingSheet();
    if (process.env.UPDATE_WORDING === "1") {
      mkdirSync(dirname(SHEET_PATH), { recursive: true });
      writeFileSync(SHEET_PATH, sheet);
    }
    expect(existsSync(SHEET_PATH), "docs/review/member-ai-wording.md is missing: run with UPDATE_WORDING=1").toBe(true);
    expect(readFileSync(SHEET_PATH, "utf8"), "the wording changed: regenerate the sheet with UPDATE_WORDING=1").toBe(sheet);
  });
});

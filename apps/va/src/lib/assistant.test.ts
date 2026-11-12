import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSISTANT_FEATURES, aiSettingsError, budgetPercent, checkContract, isOwnIntakePath, usd } from "./assistant";
import { CONTRACT_READER } from "./contract-reader";
import { MAX_CONTRACT_BYTES } from "./intake-fields";

const ME = "a1000000-0000-4000-8000-000000000001";
const OTHER = "b2000000-0000-4000-8000-000000000002";
const FILE = "3f2b8c1e-9d4a-4b6f-8a1c-5e7d9f0a2b3c";
const pdf = new TextEncoder().encode("%PDF-1.7\n");

describe("assistant features", () => {
  it("each has a flag that a migration ships (off) and a matching pipeline key", () => {
    const dir = join(__dirname, "../../../../packages/db/supabase/migrations");
    const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    for (const f of ASSISTANT_FEATURES) {
      expect(f.flag).toMatch(/^ai_staff_[a-z0-9_]+$/);
      expect(sql, f.flag).toContain(`('${f.flag}',`);
      expect(f.where.href.startsWith("/")).toBe(true);
    }
    expect(ASSISTANT_FEATURES.map((f) => f.flag)).toContain(`ai_${CONTRACT_READER.key}`);
  });
});

describe("contract uploads", () => {
  it("only reads from the caller's own staging folder", () => {
    expect(isOwnIntakePath(`intake/${ME}/${FILE}.pdf`, ME)).toBe(true);
    expect(isOwnIntakePath(`intake/${OTHER}/${FILE}.pdf`, ME)).toBe(false);
    expect(isOwnIntakePath(`deal/${ME}/${FILE}.pdf`, ME)).toBe(false);
    expect(isOwnIntakePath(`intake/${ME}/../${OTHER}/${FILE}.pdf`, ME)).toBe(false);
    expect(isOwnIntakePath(`intake/${ME}/${FILE}.pdf.exe`, ME)).toBe(false);
    expect(isOwnIntakePath(`intake/${ME}/contract.pdf`, ME)).toBe(false);
    expect(isOwnIntakePath(`x/intake/${ME}/${FILE}.pdf`, ME)).toBe(false);
  });

  it("takes PDFs by their first bytes, up to 20 MB", () => {
    expect(checkContract(1000, pdf)).toBeNull();
    expect(checkContract(MAX_CONTRACT_BYTES, pdf)).toBeNull();
    expect(checkContract(MAX_CONTRACT_BYTES + 1, pdf)).toMatch(/20 MB/);
    expect(checkContract(0, new Uint8Array())).toMatch(/Choose/);
    expect(checkContract(1000, new TextEncoder().encode("<html>contract.pdf"))).toMatch(/as a PDF/);
    expect(checkContract(1000, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toMatch(/as a PDF/);
  });
});

describe("spend display", () => {
  it("formats millionths of a dollar, from numbers or strings", () => {
    expect(usd(12_400_000)).toBe("$12.40");
    expect(usd("250000")).toBe("$0.25");
    expect(usd(null)).toBe("$0.00");
  });

  it("shows the share of the budget used, capped at 100", () => {
    expect(budgetPercent(0, 100)).toBe(0);
    expect(budgetPercent(80_000_000, 100)).toBe(80);
    expect(budgetPercent("150000000", 100)).toBe(100);
    expect(budgetPercent(0, 0)).toBe(0);
    expect(budgetPercent(1, 0)).toBe(100);
  });
});

describe("settings errors", () => {
  it("turns database refusals into plain messages", () => {
    expect(aiSettingsError("zdr_not_confirmed")).toMatch(/Zero Data Retention confirmation first/);
    expect(aiSettingsError("admin_only")).toMatch(/Only an admin/);
    expect(aiSettingsError('new row violates check constraint "app_settings_ai_monthly_budget_usd_check"')).toMatch(/out of range/);
    expect(aiSettingsError("connection reset")).toBe("Something went wrong. Please try again.");
  });
});

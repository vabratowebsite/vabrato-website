import { beforeEach, describe, expect, it, vi } from "vitest";

// S6b PR 7b, MUST 6: reading repair items only from this deal's own
// inspection report. The server action runs against a small in-memory
// stand-in for Supabase (RLS itself is tested in packages/db); the model is
// a fake that records what it was asked. Fictional ids and files.

const DEAL = "d1000000-0000-4000-8000-0000000033d1";
const OTHER_DEAL = "d2000000-0000-4000-8000-0000000033d2";
const DOC = { other: "b1000000-0000-4000-8000-0000000033b1", rpa: "b2000000-0000-4000-8000-0000000033b2", report: "b3000000-0000-4000-8000-0000000033b3" };

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const asked: { feature: string; deal: string | null }[] = [];

function table(name: string) {
  const filters: [string, unknown][] = [];
  let insertRow: Row | null = null;
  const rows = () => (db[name] ?? []).filter((r) => filters.every(([col, val]) => (col.includes("->>") ? (r[col.split("->>")[0]!] as Row | undefined)?.[col.split("->>")[1]!] : r[col]) === val));
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => (filters.push([col, val]), q),
    insert: (row: Row) => ((insertRow = { id: "e9000000-0000-4000-8000-0000000033e9", status: "draft", ...row }), q),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => {
      if (insertRow) {
        (db[name] ??= []).push(insertRow);
        return { data: insertRow, error: null };
      }
      return { data: rows()[0] ?? null, error: null };
    },
  };
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: async () => ({
    from: table,
    storage: { from: () => ({ download: async () => ({ data: new Blob([Buffer.from("%PDF-1.4\n<< /Type /Page >>\n%%EOF")]), error: null }) }) },
  }),
}));
vi.mock("@vabrato/lib", async (orig) => ({ ...(await orig<typeof import("@vabrato/lib")>()), getProfile: async () => ({ id: "c1000000-0000-4000-8000-0000000033c1", role: "agent", full_name: "Avery Example" }) }));
vi.mock("@/lib/ai", () => ({
  aiKeyConfigured: () => true,
  aiDeps: () => ({
    store: {
      begin: async (feature: string, deal: string | null) => {
        asked.push({ feature, deal: deal ?? null });
        return { allowed: true, run_id: "run-1" };
      },
      finish: async () => undefined,
    },
    model: {
      generate: async () => ({
        text: JSON.stringify({ items: [{ title: "Missing GFCI at kitchen outlets", detail: "Not protected.", location: "Kitchen", trade: "electrical", page: 4, severity_label: "Safety concern", severity: "safety" }] }),
        citations: [],
        stop: "end",
        model: "claude-opus-5-5",
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }),
    },
    log: () => undefined,
  }),
}));

const { startRepairItemsAction } = await import("./repair-actions");

describe("repair items read only this deal's own inspection report", () => {
  beforeEach(() => {
    asked.length = 0;
    db.deals = [
      { id: DEAL, address: "1 Fixture Way, Belmont", ratification_date: "2026-10-01", days_to_close: 30 },
      { id: OTHER_DEAL, address: "2 Fixture Way, Belmont", ratification_date: "2026-10-01", days_to_close: 30 },
    ];
    db.deal_documents = [
      { id: DOC.other, deal_id: OTHER_DEAL, path: `deal/${OTHER_DEAL}/staff/x.pdf`, file_name: "Other inspection.pdf", doc_types: ["home_inspection"] },
      { id: DOC.rpa, deal_id: DEAL, path: `deal/${DEAL}/staff/rpa.pdf`, file_name: "Purchase agreement.pdf", doc_types: ["rpa"] },
      { id: DOC.report, deal_id: DEAL, path: `deal/${DEAL}/staff/report.pdf`, file_name: "Home inspection.pdf", doc_types: ["home_inspection"] },
    ];
    db.ai_drafts = [];
  });

  it("another deal's document is refused, and nothing is sent", async () => {
    expect(await startRepairItemsAction(DEAL, DOC.other)).toEqual({ ok: false, error: "That document isn't on this transaction." });
    expect(asked).toEqual([]);
  });

  it("a document that isn't an inspection report is refused", async () => {
    expect(await startRepairItemsAction(DEAL, DOC.rpa)).toMatchObject({ ok: false, error: expect.stringMatching(/home or pest inspection/) });
    expect(asked).toEqual([]);
  });

  it("this deal's inspection report is read, for this deal, and saved as a draft list", async () => {
    const r = await startRepairItemsAction(DEAL, DOC.report);
    expect(r).toMatchObject({ ok: true });
    expect(asked).toEqual([{ feature: "staff_inspection_items", deal: DEAL }]);
    const saved = db.ai_drafts![0]!;
    expect(saved).toMatchObject({ kind: "inspection_items", deal_id: DEAL });
    expect((saved.content as { document_id: string; items: unknown[] }).document_id).toBe(DOC.report);
  });

  it("a list already in progress for the report is opened instead of reading it again", async () => {
    db.ai_drafts = [{ id: "f9000000-0000-4000-8000-0000000033f9", kind: "inspection_items", deal_id: DEAL, status: "draft", content: { document_id: DOC.report } }];
    expect(await startRepairItemsAction(DEAL, DOC.report)).toEqual({ ok: true, id: "f9000000-0000-4000-8000-0000000033f9", message: "This report already has a list in progress." });
    expect(asked).toEqual([]);
  });
});

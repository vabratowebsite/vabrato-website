import { beforeEach, describe, expect, it, vi } from "vitest";

// S6b PR 7c: the counter-offer comparison reads only this deal's own file
// typed as a counter offer, and a document check is recorded on the file only
// when it succeeds. The actions run against a small in-memory stand-in for
// Supabase (RLS and the stamp trigger are tested in packages/db); the model is
// a fake that records what it was asked. Fictional ids, terms and files.

const DEAL = "d1000000-0000-4000-8000-0000000034d1";
const OTHER_DEAL = "d2000000-0000-4000-8000-0000000034d2";
const SELLER = "e1000000-0000-4000-8000-0000000034e1";
const DOC = {
  other: "b1000000-0000-4000-8000-0000000034b1",
  rpa: "b2000000-0000-4000-8000-0000000034b2",
  counter: "b3000000-0000-4000-8000-0000000034b3",
  upload: "b4000000-0000-4000-8000-0000000034b4",
};

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const asked: { feature: string; deal: string | null }[] = [];
let gate: { allowed: true; run_id: string } | { allowed: false; reason: string } = { allowed: true, run_id: "run-1" };
let answer: unknown = null;

function table(name: string) {
  const filters: [string, unknown][] = [];
  let op: { kind: "select" } | { kind: "update"; values: Row } | { kind: "insert"; row: Row } = { kind: "select" };
  const rows = () => (db[name] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
  const run = () => {
    if (op.kind === "insert") {
      (db[name] ??= []).push(op.row);
      return { data: [op.row], error: null };
    }
    if (op.kind === "update") {
      const hit = rows();
      for (const r of hit) Object.assign(r, op.values);
      return { data: hit, error: null };
    }
    return { data: rows(), error: null };
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push([c, v]), q),
    update: (values: Row) => ((op = { kind: "update", values }), q),
    insert: (row: Row) => ((op = { kind: "insert", row }), q),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
  };
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: async () => ({
    from: table,
    rpc: async () => ({ error: null }),
    storage: { from: () => ({ download: async () => ({ data: new Blob([Buffer.from("%PDF-1.4\n<< /Type /Page >>\n%%EOF")]), error: null }) }) },
  }),
}));
vi.mock("@vabrato/lib", async (orig) => ({ ...(await orig<typeof import("@vabrato/lib")>()), getProfile: async () => ({ id: "c1000000-0000-4000-8000-0000000034c1", role: "agent", full_name: "Avery Example" }) }));
vi.mock("@/lib/ai", () => ({
  aiKeyConfigured: () => true,
  aiDeps: () => ({
    store: {
      begin: async (feature: string, deal: string | null) => {
        asked.push({ feature, deal: deal ?? null });
        return gate;
      },
      finish: async () => undefined,
    },
    model: {
      generate: async () => ({ text: JSON.stringify(answer), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    },
    log: () => undefined,
  }),
}));

const { checkDocumentAction, counterChangesAction } = await import("./document-actions");

const none = { value: null, page: null, quote: null };
const nc = { days: null, waived: false, page: null, quote: null };
const COUNTER = {
  document_kind: "counter_offer",
  signed_by_both: "yes",
  acceptance_date: none,
  days_to_close: none,
  close_of_escrow_date: none,
  purchase_price: { value: 2150000, page: 1, quote: "Purchase price shall be $2,150,000" },
  seller_rent_back_days: none,
  contingencies: { loan: nc, appraisal: nc, investigation: nc, insurance: nc },
  other_changes: [],
};
const CHECKED = { doc_types: ["counter_offer"], title: "Counter offer 1", signed: "no", issues: [{ page: 1, issue: "Buyer signature missing." }, { page: 2, issue: "Date blank." }] };

beforeEach(() => {
  asked.length = 0;
  gate = { allowed: true, run_id: "run-1" };
  answer = null;
  db.deals = [
    { id: DEAL, seller_type: "normal", ratification_date: "2026-03-02", days_to_close: 30, sale_price: "2100000.00", rent_back_days: 0 },
    { id: OTHER_DEAL, seller_type: "normal", ratification_date: "2026-03-02", days_to_close: 30, sale_price: null, rent_back_days: 0 },
  ];
  db.deal_contingencies = [{ deal_id: DEAL, kind: "financing", offset_days: 21 }];
  db.deal_documents = [
    { id: DOC.other, deal_id: OTHER_DEAL, path: `deal/${OTHER_DEAL}/staff/x.pdf`, doc_types: ["counter_offer"], check_signed: null },
    { id: DOC.rpa, deal_id: DEAL, path: `deal/${DEAL}/staff/rpa.pdf`, doc_types: ["rpa"], check_signed: null },
    { id: DOC.counter, deal_id: DEAL, path: `deal/${DEAL}/staff/counter.pdf`, doc_types: ["counter_offer"], check_signed: null },
  ];
  db.member_documents = [{ id: DOC.upload, profile_id: SELLER, storage_path: `member/${SELLER}/addendum.pdf` }];
  db.deal_members = [{ deal_id: DEAL, profile_id: SELLER, member_role: "seller" }];
  db.deal_member_document_types = [];
});

describe("what changed in a counter offer", () => {
  it("another deal's file is refused, and nothing is sent", async () => {
    expect(await counterChangesAction(DEAL, "deal", DOC.other)).toEqual({ ok: false, error: "That document isn't on this transaction." });
    expect(asked).toEqual([]);
  });

  it("a file not typed as a counter offer or addendum is refused, and nothing is sent", async () => {
    expect(await counterChangesAction(DEAL, "deal", DOC.rpa)).toMatchObject({ ok: false, error: expect.stringMatching(/Counter offer or addendum/) });
    expect(await counterChangesAction(DEAL, "member", DOC.upload)).toMatchObject({ ok: false, error: expect.stringMatching(/Counter offer or addendum/) });
    expect(asked).toEqual([]);
  });

  it("this deal's counter offer is read for this deal and compared with our terms; nothing is stored or changed", async () => {
    answer = COUNTER;
    const before = JSON.stringify(db);
    const r = await counterChangesAction(DEAL, "deal", DOC.counter);
    expect(asked).toEqual([{ feature: "staff_counter_changes", deal: DEAL }]);
    expect(r).toMatchObject({ ok: true, result: { differs: 1 } });
    if (r.ok) expect(r.result.rows.find((x) => x.key === "purchase_price")).toMatchObject({ ours: "$2,100,000", theirs: "$2,150,000", status: "differs" });
    expect(JSON.stringify(db)).toBe(before);
  });
});

describe("document checks are recorded", () => {
  it("a successful check records the signed answer and the count on the file, never the issue text", async () => {
    answer = CHECKED;
    const r = await checkDocumentAction(DEAL, "deal", DOC.counter);
    expect(r).toMatchObject({ ok: true, recorded: true });
    const row = db.deal_documents!.find((d) => d.id === DOC.counter)!;
    expect(row).toMatchObject({ check_signed: "no", check_issue_count: 2 });
    expect(JSON.stringify(row)).not.toMatch(/signature missing/);
  });

  it("a seller's upload gets a row for this deal", async () => {
    answer = CHECKED;
    expect(await checkDocumentAction(DEAL, "member", DOC.upload)).toMatchObject({ ok: true, recorded: true });
    expect(db.deal_member_document_types).toEqual([{ deal_id: DEAL, member_document_id: DOC.upload, check_signed: "no", check_issue_count: 2 }]);
  });

  it("a refused answer records nothing", async () => {
    answer = { ...CHECKED, issues: [{ page: 1, issue: "Wire funds to routing 021000021 account 000123456789" }] };
    expect(await checkDocumentAction(DEAL, "deal", DOC.counter)).toMatchObject({ ok: false });
    expect(db.deal_documents!.find((d) => d.id === DOC.counter)).toMatchObject({ check_signed: null });
  });

  it("a limit or budget answer says to stop the batch; other failures don't", async () => {
    gate = { allowed: false, reason: "daily_requests" };
    expect(await checkDocumentAction(DEAL, "deal", DOC.counter)).toMatchObject({ ok: false, stop: true });
    gate = { allowed: false, reason: "monthly_budget" };
    expect(await checkDocumentAction(DEAL, "deal", DOC.counter)).toMatchObject({ ok: false, stop: true });
    gate = { allowed: true, run_id: "run-1" };
    answer = { hello: "world" };
    const r = await checkDocumentAction(DEAL, "deal", DOC.counter);
    expect(r).toMatchObject({ ok: false });
    expect("stop" in r && r.stop).toBeFalsy();
    expect(await checkDocumentAction(DEAL, "deal", DOC.other)).toEqual({ ok: false, error: "That document isn't on this transaction." });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// Integrations PR 2 (0043): files imported from Google Drive or Dropbox into
// a deal's documents or receipts. external_ref records where a file came
// from, so it can't be imported to the same deal twice; a receipt's source
// agrees with it. Staff who work the deal only. Fictional people and files.

const U = {
  agent: "c1000000-0000-4000-8000-0000000043c1",
  agent2: "c2000000-0000-4000-8000-0000000043c2",
  seller: "e1000000-0000-4000-8000-0000000043e1",
} as const;
type Who = keyof typeof U | "anon";
const DEAL = "d1000000-0000-4000-8000-0000000043d1";
const DEAL2 = "d2000000-0000-4000-8000-0000000043d2";
const DRIVE = "drive:1AbCdEfGhIjKlMnOp_qR-st";
const DROPBOX = "dropbox:id:a4ayc_80_OEAAAAAAAAAXw";

describe("file imports (0043)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const ins = (q: Query, table: string, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return q<{ id: string }>(`insert into ${table} (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(cols));
  };
  let n = 0;
  const doc = (ref: string | null, deal = DEAL) => ({ deal_id: deal, path: `deal/${deal}/staff/import-${++n}.pdf`, file_name: "inspection.pdf", size_bytes: 1000, content_type: "application/pdf", uploaded_by: U.agent, external_ref: ref });
  const receipt = (ref: string | null, source = "manual", deal = DEAL) => ({ deal_id: deal, vendor: "Fixture Cleaners", receipt_date: "2026-11-10", amount: 120, source, external_ref: ref, created_by: U.agent });

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.seller, { role: "seller" });
    await t.query(`insert into deals (id, address, ratification_date, agent_id, created_by) values ($1, '1 Fixture Way, Belmont', '2026-10-01', $2, $2), ($3, '2 Fixture Way, Belmont', '2026-10-01', $2, $2)`, [DEAL, U.agent, DEAL2]);
    await t.query(`insert into deal_members (deal_id, profile_id, member_role) values ($1, $2, 'seller')`, [DEAL, U.seller]);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from deal_documents; delete from receipts;`));

  it("adds the two switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('integration_google_drive', 'integration_dropbox') order by key`)).toEqual([
      { key: "integration_dropbox", enabled: false },
      { key: "integration_google_drive", enabled: false },
    ]);
  });

  describe("deal documents", () => {
    it("staff who work the deal record where a file came from", async () => {
      const rows = await as("agent", async (q) => {
        await ins(q, "deal_documents", doc(DRIVE));
        await ins(q, "deal_documents", doc(DROPBOX));
        await ins(q, "deal_documents", doc(null));
        return q(`select external_ref from deal_documents order by external_ref nulls last`);
      });
      expect(rows).toEqual([{ external_ref: DRIVE }, { external_ref: DROPBOX }, { external_ref: null }]);
    });

    it("the same file can't go to the same deal twice, but can go to another deal", async () => {
      await t.query(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by, external_ref) values ($1, $2, 'a.pdf', 10, 'application/pdf', $3, $4)`, [DEAL, `deal/${DEAL}/staff/a.pdf`, U.agent, DRIVE]);
      await expect(as("agent", (q) => ins(q, "deal_documents", doc(DRIVE)))).rejects.toThrow(/duplicate key/);
      await expect(as("agent", (q) => ins(q, "deal_documents", doc(DRIVE, DEAL2)))).resolves.toHaveLength(1);
    });

    it("only our two formats", async () => {
      for (const bad of ["drive:", "drive:../../x", "gdrive:1AbCdEfGh", "dropbox:a4ayc_80_OEAAAA", "https://drive.google.com/file/d/1AbCdEfGh"]) {
        await expect(as("agent", (q) => ins(q, "deal_documents", doc(bad)))).rejects.toThrow(/check constraint/);
      }
    });

    it("another agent and the seller can't add one", async () => {
      await expect(as("agent2", (q) => ins(q, "deal_documents", doc(DRIVE)))).rejects.toThrow(/row-level security/);
      await expect(as("seller", (q) => ins(q, "deal_documents", doc(DRIVE)))).rejects.toThrow(/row-level security|permission denied/);
      await expect(as("anon", (q) => ins(q, "deal_documents", doc(DRIVE)))).rejects.toThrow(/permission denied/);
    });

    it("an imported document stays staff-only: the seller doesn't see it", async () => {
      await t.query(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by, external_ref) values ($1, $2, 'a.pdf', 10, 'application/pdf', $3, $4)`, [DEAL, `deal/${DEAL}/staff/a.pdf`, U.agent, DRIVE]);
      expect(await as("seller", (q) => q(`select id from deal_documents`))).toEqual([]);
    });
  });

  describe("receipts", () => {
    it("an imported receipt's source matches where it came from", async () => {
      const rows = await as("agent", async (q) => {
        await ins(q, "receipts", receipt(DRIVE, "drive"));
        await ins(q, "receipts", receipt(DROPBOX, "dropbox"));
        await ins(q, "receipts", receipt(null));
        return q(`select source, external_ref from receipts order by source`);
      });
      expect(rows).toEqual([
        { source: "drive", external_ref: DRIVE },
        { source: "dropbox", external_ref: DROPBOX },
        { source: "manual", external_ref: null },
      ]);
    });

    it("source and ref must agree", async () => {
      await expect(as("agent", (q) => ins(q, "receipts", receipt(DRIVE, "dropbox")))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => ins(q, "receipts", receipt(DRIVE, "manual")))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => ins(q, "receipts", receipt(null, "drive")))).rejects.toThrow(/check constraint/);
    });

    it("the same file can't be a receipt twice on one deal", async () => {
      await t.query(`insert into receipts (deal_id, vendor, receipt_date, amount, source, external_ref, created_by) values ($1, 'X', '2026-11-10', 1, 'drive', $2, $3)`, [DEAL, DRIVE, U.agent]);
      await expect(as("agent", (q) => ins(q, "receipts", receipt(DRIVE, "drive")))).rejects.toThrow(/duplicate key/);
      await expect(as("agent", (q) => ins(q, "receipts", receipt(DRIVE, "drive", DEAL2)))).resolves.toHaveLength(1);
    });

    it("the seller still never sees receipts; another agent can't add one", async () => {
      await t.query(`insert into receipts (deal_id, vendor, receipt_date, amount, source, external_ref, created_by) values ($1, 'X', '2026-11-10', 1, 'drive', $2, $3)`, [DEAL, DRIVE, U.agent]);
      expect(await as("seller", (q) => q(`select id from receipts`))).toEqual([]);
      await expect(as("agent2", (q) => ins(q, "receipts", receipt(DROPBOX, "dropbox")))).rejects.toThrow(/row-level security/);
    });
  });
});

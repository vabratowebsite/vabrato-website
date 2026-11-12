import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6b PR 7a (0032): deal documents, the sellers' own uploads tagged for a
// deal, "not needed" marks, and the staff-only folder in deal-docs. Staff
// with deal access only; the seller sees shared files, never staff/.
// Fictional people and files.

const U = {
  admin: "a1000000-0000-4000-8000-0000000032a1",
  agent: "c1000000-0000-4000-8000-0000000032c1",
  agent2: "c2000000-0000-4000-8000-0000000032c2",
  seller: "e1000000-0000-4000-8000-0000000032e1",
  seller2: "e2000000-0000-4000-8000-0000000032e2",
  buyer: "f1000000-0000-4000-8000-0000000032f1",
} as const;
type Who = keyof typeof U | "anon";
const DEAL = "d1000000-0000-4000-8000-0000000032d1";
const DEAL2 = "d2000000-0000-4000-8000-0000000032d2";
const MDOC = "b1000000-0000-4000-8000-0000000032b1";
const MDOC2 = "b2000000-0000-4000-8000-0000000032b2";

describe("deal documents (0032)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const doc = (q: Query, cols: Record<string, unknown>) => {
    const row = { deal_id: DEAL, file_name: "rpa.pdf", size_bytes: 1000, content_type: "application/pdf", ...cols };
    const keys = Object.keys(row);
    return q<{ id: string }>(`insert into deal_documents (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(row));
  };
  const seed = async (path: string, shared = false, deal = DEAL) =>
    (await t.query<{ id: string }>(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, shared, uploaded_by) values ($1, $2, 'f.pdf', 10, 'application/pdf', $3, $4) returning id`, [deal, path, shared, U.agent]))[0]!.id;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.seller2, { role: "seller" });
    await createUser(t, U.buyer);
    await t.query(`update profiles set agent_id = $1 where id = $2`, [U.agent, U.seller]);
    await t.query(`insert into deals (id, address, ratification_date, agent_id, created_by) values ($1, '1 Fixture Way, Belmont', '2026-10-01', $2, $2), ($3, '2 Fixture Way, Belmont', '2026-10-01', $4, $4)`, [DEAL, U.agent, DEAL2, U.agent2]);
    await t.query(`insert into deal_members (deal_id, profile_id, member_role) values ($1, $2, 'seller'), ($3, $4, 'seller')`, [DEAL, U.seller, DEAL2, U.seller2]);
    await t.query(
      `insert into member_documents (id, profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values
        ($1, $2, 'spq.pdf', $5, 10, 'application/pdf', $2),
        ($3, $4, 'other.pdf', $6, 10, 'application/pdf', $4)`,
      [MDOC, U.seller, MDOC2, U.seller2, `member/${U.seller}/spq.pdf`, `member/${U.seller2}/other.pdf`],
    );
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from deal_documents; delete from deal_member_document_types; delete from deal_checklist_marks; delete from storage.objects;`);
  });

  it("adds the two switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_staff_document_check', 'ai_staff_receipt_reader') order by key`)).toEqual([
      { key: "ai_staff_document_check", enabled: false },
      { key: "ai_staff_receipt_reader", enabled: false },
    ]);
  });

  describe("deal_documents", () => {
    it("staff with deal access add and read them; the deal's agent and admins", async () => {
      expect(await as("agent", (q) => doc(q, { path: `deal/${DEAL}/staff/a-rpa.pdf`, doc_types: ["rpa", "agency_disclosure"] }))).toHaveLength(1);
      expect(await as("admin", (q) => doc(q, { path: `deal/${DEAL}/staff/b-tds.pdf` }))).toHaveLength(1);
      await seed(`deal/${DEAL}/staff/c.pdf`);
      expect(await as("agent", (q) => q(`select path from deal_documents`))).toHaveLength(1);
      expect(await as("admin", (q) => q(`select path from deal_documents`))).toHaveLength(1);
    });

    it("another agent, the seller, a buyer and the public can't read or add them", async () => {
      await seed(`deal/${DEAL}/staff/x.pdf`);
      await seed(`deal/${DEAL}/shared.pdf`, true);
      for (const who of ["agent2", "seller", "buyer"] as const) {
        expect(await as(who, (q) => q(`select id from deal_documents`))).toEqual([]);
        await expect(as(who, (q) => doc(q, { path: `deal/${DEAL}/staff/y.pdf` }))).rejects.toThrow(/row-level security/);
      }
      await expect(as("anon", (q) => q(`select id from deal_documents`))).rejects.toThrow(/permission denied/);
      expect(await as("agent2", (q) => q(`update deal_documents set doc_types = '{rpa}' returning id`))).toEqual([]);
      expect(await as("seller", (q) => q(`delete from deal_documents returning id`))).toEqual([]);
    });

    it("the path stays in the deal's folder, and 'shared' matches where the file is", async () => {
      await expect(as("agent", (q) => doc(q, { path: `deal/${DEAL2}/staff/x.pdf` }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => doc(q, { path: `deal/${DEAL}/other/x.pdf` }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => doc(q, { path: `deal/${DEAL}/staff/x.pdf`, shared: true }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => doc(q, { path: `deal/${DEAL}/x.pdf` }))).rejects.toThrow(/check constraint/);
      expect(await as("agent", (q) => doc(q, { path: `deal/${DEAL}/x.pdf`, shared: true }))).toHaveLength(1);
    });

    it("sharing moves the path; the deal and uploader can't be changed; checklist keys are checked", async () => {
      const id = await seed(`deal/${DEAL}/staff/a-x.pdf`);
      expect(await as("agent", (q) => q(`update deal_documents set path = $2, shared = true where id = $1 returning shared`, [id, `deal/${DEAL}/x.pdf`]))).toEqual([{ shared: true }]);
      await expect(as("agent", (q) => q(`update deal_documents set deal_id = $2 where id = $1`, [id, DEAL2]))).rejects.toThrow(/permission denied/);
      await expect(as("agent", (q) => q(`update deal_documents set uploaded_by = $2 where id = $1`, [id, U.admin]))).rejects.toThrow(/permission denied/);
      await expect(as("agent", (q) => q(`update deal_documents set doc_types = '{"Not A Key"}' where id = $1`, [id]))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => doc(q, { path: `deal/${DEAL}/staff/z.pdf`, uploaded_by: U.admin }))).rejects.toThrow(/row-level security/);
    });
  });

  describe("the sellers' own uploads", () => {
    const tag = (who: Who, deal: string, mdoc: string) => as(who, (q) => q(`insert into deal_member_document_types (deal_id, member_document_id, doc_types) values ($1, $2, '{spq}') returning doc_types`, [deal, mdoc]));

    it("staff on the deal tag a seller's upload for that deal", async () => {
      expect(await tag("agent", DEAL, MDOC)).toEqual([{ doc_types: ["spq"] }]);
      await t.query(`insert into deal_member_document_types (deal_id, member_document_id, doc_types) values ($1, $2, '{spq}')`, [DEAL, MDOC]);
      expect(await as("agent", (q) => q(`update deal_member_document_types set doc_types = '{spq,avid}' returning doc_types`))).toEqual([{ doc_types: ["spq", "avid"] }]);
    });

    it("not another deal's seller's file, not without deal access, and never the seller", async () => {
      await expect(tag("agent", DEAL, MDOC2)).rejects.toThrow(/row-level security/);
      await expect(tag("agent2", DEAL, MDOC)).rejects.toThrow(/row-level security/);
      await expect(tag("seller", DEAL, MDOC)).rejects.toThrow(/row-level security/);
      await t.query(`insert into deal_member_document_types (deal_id, member_document_id, doc_types) values ($1, $2, '{spq}')`, [DEAL, MDOC]);
      expect(await as("agent2", (q) => q(`select * from deal_member_document_types`))).toEqual([]);
      expect(await as("seller", (q) => q(`select * from deal_member_document_types`))).toEqual([]);
    });
  });

  describe("not-needed marks", () => {
    const mark = (who: Who, deal = DEAL) => as(who, (q) => q(`insert into deal_checklist_marks (deal_id, item_key, note) values ($1, 'lead_paint', 'Built in 1998') returning item_key`, [deal]));

    it("staff with deal access mark and clear them", async () => {
      expect(await mark("agent")).toEqual([{ item_key: "lead_paint" }]);
      await t.query(`insert into deal_checklist_marks (deal_id, item_key) values ($1, 'lead_paint')`, [DEAL]);
      expect(await as("agent", (q) => q(`delete from deal_checklist_marks returning item_key`))).toEqual([{ item_key: "lead_paint" }]);
    });

    it("nobody else can", async () => {
      await expect(mark("agent2")).rejects.toThrow(/row-level security/);
      await expect(mark("seller")).rejects.toThrow(/row-level security/);
      await expect(mark("anon")).rejects.toThrow(/permission denied/);
      await t.query(`insert into deal_checklist_marks (deal_id, item_key) values ($1, 'nhd')`, [DEAL]);
      expect(await as("agent2", (q) => q(`select * from deal_checklist_marks`))).toEqual([]);
      expect(await as("seller", (q) => q(`select * from deal_checklist_marks`))).toEqual([]);
    });
  });

  describe("deal-docs storage", () => {
    const put = (bucket: string, name: string) => t.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name]);
    const see = (who: Who, bucket = "deal-docs") => as(who, (q) => q<{ name: string }>(`select name from storage.objects where bucket_id = $1 order by name`, [bucket])).then((r) => r.map((o) => o.name));

    it("the seller sees shared files, never the staff folder; staff on the deal see both", async () => {
      await put("deal-docs", `deal/${DEAL}/shared.pdf`);
      await put("deal-docs", `deal/${DEAL}/staff/private.pdf`);
      expect(await see("seller")).toEqual([`deal/${DEAL}/shared.pdf`]);
      expect(await see("agent")).toEqual([`deal/${DEAL}/shared.pdf`, `deal/${DEAL}/staff/private.pdf`]);
      expect(await see("admin")).toHaveLength(2);
      expect(await see("agent2")).toEqual([]);
      expect(await see("seller2")).toEqual([]);
      expect(await see("buyer")).toEqual([]);
    });

    it("only staff on the deal upload to or delete from the staff folder", async () => {
      const upload = (who: Who) => as(who, (q) => q(`insert into storage.objects (bucket_id, name) values ('deal-docs', $1) returning name`, [`deal/${DEAL}/staff/new.pdf`]));
      expect(await upload("agent")).toHaveLength(1);
      await expect(upload("seller")).rejects.toThrow(/row-level security/);
      await expect(upload("agent2")).rejects.toThrow(/row-level security/);
      await put("deal-docs", `deal/${DEAL}/staff/private.pdf`);
      expect(await as("seller", (q) => q(`delete from storage.objects returning name`))).toEqual([]);
      expect(await as("agent", (q) => q(`delete from storage.objects returning name`))).toHaveLength(1);
    });

    it("receipt uploads stay staff-only", async () => {
      await put("receipts", `deal/${DEAL}/uploads/${U.agent}/r.jpg`);
      expect(await see("agent", "receipts")).toHaveLength(1);
      expect(await see("seller", "receipts")).toEqual([]);
      expect(await see("agent2", "receipts")).toEqual([]);
    });
  });
});

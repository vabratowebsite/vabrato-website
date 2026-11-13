import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6b PR 7c (0034): document checks recorded on deal files and on the
// seller's uploads tagged for a deal, and the counter-offer switch. The stamp
// is always the caller and the time of the change. Staff with deal access
// only. Fictional people and files.

const U = {
  admin: "a1000000-0000-4000-8000-0000000034a1",
  agent: "c1000000-0000-4000-8000-0000000034c1",
  agent2: "c2000000-0000-4000-8000-0000000034c2",
  seller: "e1000000-0000-4000-8000-0000000034e1",
  buyer: "f1000000-0000-4000-8000-0000000034f1",
} as const;
type Who = keyof typeof U | "anon";
const DEAL = "d1000000-0000-4000-8000-0000000034d1";
const DEAL2 = "d2000000-0000-4000-8000-0000000034d2";
const MDOC = "b1000000-0000-4000-8000-0000000034b1";

describe("document checks (0034)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const seed = async (deal = DEAL) =>
    (await t.query<{ id: string }>(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by) values ($1, $2, 'counter.pdf', 10, 'application/pdf', $3) returning id`, [deal, `deal/${deal}/staff/${crypto.randomUUID()}.pdf`, U.agent]))[0]!.id;
  type Stamp = { checked_at: string | null; checked_by: string | null; check_signed: string | null; check_issue_count: number | null };
  const stamp = async (id: string) => (await t.query<Stamp>(`select checked_at, checked_by, check_signed, check_issue_count from deal_documents where id = $1`, [id]))[0]!;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.buyer);
    await t.query(`update profiles set agent_id = $1 where id = $2`, [U.agent, U.seller]);
    await t.query(`insert into deals (id, address, ratification_date, agent_id, created_by) values ($1, '1 Fixture Way, Belmont', '2026-10-01', $2, $2), ($3, '2 Fixture Way, Belmont', '2026-10-01', $4, $4)`, [DEAL, U.agent, DEAL2, U.agent2]);
    await t.query(`insert into deal_members (deal_id, profile_id, member_role) values ($1, $2, 'seller')`, [DEAL, U.seller]);
    await t.query(`insert into member_documents (id, profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ($1, $2, 'addendum.pdf', $3, 10, 'application/pdf', $2)`, [MDOC, U.seller, `member/${U.seller}/addendum.pdf`]);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from deal_documents; delete from deal_member_document_types;`));

  it("adds the counter-offer switch, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key = 'ai_staff_counter_changes'`)).toEqual([{ key: "ai_staff_counter_changes", enabled: false }]);
  });

  it("a new file is not checked", async () => {
    expect(await stamp(await seed())).toEqual({ checked_at: null, checked_by: null, check_signed: null, check_issue_count: null });
  });

  const STAMP = `select checked_at, checked_by, check_signed, check_issue_count from deal_documents where id = $1`;

  it("staff on the deal record a check; the stamp is always the caller and now", async () => {
    const id = await seed();
    const s = await as("agent", async (q) => {
      await q(`update deal_documents set check_signed = 'no', check_issue_count = 2, checked_at = '2001-01-01' where id = $1`, [id]);
      return (await q<Stamp>(STAMP, [id]))[0]!;
    });
    expect(s).toMatchObject({ checked_by: U.agent, check_signed: "no", check_issue_count: 2 });
    expect(Date.now() - Date.parse(s.checked_at!)).toBeLessThan(60_000);
    // The admin re-checks with the same answers: stamped again, as the admin.
    await t.query(`update deal_documents set check_signed = 'no', check_issue_count = 2 where id = $1`, [id]);
    const again = await as("admin", async (q) => {
      await q(`update deal_documents set check_signed = 'no', check_issue_count = 2, checked_at = now() where id = $1`, [id]);
      return (await q<Stamp>(STAMP, [id]))[0]!;
    });
    expect(again).toMatchObject({ checked_by: U.admin });
  });

  it("checked_by can't be set by a client, and a check can't be cleared or half-recorded", async () => {
    const id = await seed();
    await expect(as("agent", (q) => q(`update deal_documents set checked_by = $2 where id = $1`, [id, U.admin]))).rejects.toThrow(/permission denied/);
    await t.query(`update deal_documents set check_signed = 'yes', check_issue_count = 0 where id = $1`, [id]);
    await expect(as("agent", (q) => q(`update deal_documents set check_signed = null, check_issue_count = null where id = $1`, [id]))).rejects.toThrow(/check_incomplete/);
    const s = await as("agent", async (q) => {
      await q(`update deal_documents set checked_at = null where id = $1`, [id]);
      return (await q<Stamp>(STAMP, [id]))[0]!;
    });
    expect(s).toMatchObject({ checked_by: U.agent, check_signed: "yes" });
    expect(s.checked_at).not.toBeNull();
    const fresh = await seed();
    await expect(as("agent", (q) => q(`update deal_documents set check_signed = 'yes' where id = $1`, [fresh]))).rejects.toThrow(/check_incomplete/);
    await expect(as("agent", (q) => q(`update deal_documents set check_signed = 'maybe', check_issue_count = 1 where id = $1`, [fresh]))).rejects.toThrow(/check constraint/);
    await expect(as("agent", (q) => q(`update deal_documents set check_signed = 'yes', check_issue_count = 11 where id = $1`, [fresh]))).rejects.toThrow(/check constraint/);
  });

  it("an agent without deal access, the seller, a buyer and the public can't record or see checks", async () => {
    const id = await seed();
    for (const who of ["agent2", "seller", "buyer"] as const) {
      expect(await as(who, (q) => q(`update deal_documents set check_signed = 'yes', check_issue_count = 0 where id = $1 returning id`, [id]))).toEqual([]);
      expect(await as(who, (q) => q(`select checked_at from deal_documents where id = $1`, [id]))).toEqual([]);
    }
    await expect(as("anon", (q) => q(`update deal_documents set check_signed = 'yes', check_issue_count = 0 where id = $1`, [id]))).rejects.toThrow(/permission denied/);
    expect((await stamp(id)).checked_at).toBeNull();
  });

  it("the seller's upload: the check is upserted on its row for the deal", async () => {
    const MSTAMP = `select checked_at::text, checked_by, check_signed, check_issue_count, doc_types from deal_member_document_types where member_document_id = $1`;
    const row = await as("agent", async (q) => {
      await q(`insert into deal_member_document_types (deal_id, member_document_id, check_signed, check_issue_count) values ($1, $2, 'unclear', 1)`, [DEAL, MDOC]);
      return (await q<Stamp & { doc_types: string[] }>(MSTAMP, [MDOC]))[0]!;
    });
    expect(row).toMatchObject({ checked_by: U.agent, check_signed: "unclear", check_issue_count: 1, doc_types: [] });
    expect(row.checked_at).not.toBeNull();
    // An existing row (typed earlier, never checked) is updated; typing it later doesn't count as a check.
    await t.query(`insert into deal_member_document_types (deal_id, member_document_id, doc_types, updated_by) values ($1, $2, '{counter_offer}', $3)`, [DEAL, MDOC, U.agent]);
    expect((await t.query<Stamp>(MSTAMP, [MDOC]))[0]).toMatchObject({ checked_at: null, checked_by: null });
    const after = await as("admin", async (q) => {
      await q(`update deal_member_document_types set check_signed = 'yes', check_issue_count = 0, checked_at = now() where member_document_id = $1`, [MDOC]);
      const first = (await q<Stamp>(MSTAMP, [MDOC]))[0]!;
      await q(`update deal_member_document_types set doc_types = '{counter_offer,rpa}', updated_by = $2 where member_document_id = $1`, [MDOC, U.admin]);
      return { first, second: (await q<Stamp>(MSTAMP, [MDOC]))[0]! };
    });
    expect(after.first).toMatchObject({ checked_by: U.admin, check_signed: "yes" });
    expect(after.second.checked_at).toBe(after.first.checked_at);
    await expect(as("agent2", (q) => q(`insert into deal_member_document_types (deal_id, member_document_id, check_signed, check_issue_count) values ($1, $2, 'yes', 0)`, [DEAL2, MDOC]))).rejects.toThrow(/row-level security/);
  });

  it("the file's own columns stay as 0032 left them", async () => {
    const id = await seed();
    await expect(as("agent", (q) => q(`update deal_documents set file_name = 'x.pdf' where id = $1`, [id]))).rejects.toThrow(/permission denied/);
    await expect(as("agent", (q) => q(`update deal_documents set deal_id = $2 where id = $1`, [id, DEAL2]))).rejects.toThrow(/permission denied/);
  });
});

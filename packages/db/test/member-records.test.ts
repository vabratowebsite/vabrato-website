import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5 PR 4 (0019): tour requests, buyer agreement, member documents and the
// member-docs bucket, messages, and tracker cleanup. SEC-1/SEC-2 for every
// new table and the bucket. All people and data are fictional.

const U = {
  buyerA: "a2000000-0000-4000-8000-0000000004a1",
  buyerB: "b2000000-0000-4000-8000-0000000004b1",
  agentA: "a1000000-0000-4000-8000-0000000004a1", // assigned to buyerA
  agentB: "b1000000-0000-4000-8000-0000000004b1",
  admin: "d0000000-0000-4000-8000-0000000004d1",
} as const;
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security/;
const pathFor = (id: string, file = "inspection.pdf") => `member/${id}/${file}`;

describe("member records (0019)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) =>
    who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agentA, { role: "agent" });
    await createUser(t, U.agentB, { role: "agent" });
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.buyerA);
    await createUser(t, U.buyerB);
    await t.exec(`
      update profiles set agent_id = '${U.agentA}' where id = '${U.buyerA}';
      insert into mls_listings (listing_key, standard_status, list_price, city, county, list_office_mls_id, is_own_listing, modification_ts, data)
        values ('L-TOUR', 'Active', 1500000, 'San Carlos', 'San Mateo', 'EXRG', false, now(), '{}');
      insert into leads (kind, email, listing_key, profile_id) values
        ('tour', 'a@example.test', 'L-TOUR', '${U.buyerA}'),
        ('tour', 'b@example.test', 'L-TOUR', '${U.buyerB}'),
        ('contact', 'a@example.test', null, '${U.buyerA}');
      insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values
        ('${U.buyerA}', 'Inspection report.pdf', '${pathFor(U.buyerA)}', 1000, 'application/pdf', '${U.buyerA}'),
        ('${U.buyerB}', 'Disclosures.pdf', '${pathFor(U.buyerB)}', 2000, 'application/pdf', '${U.buyerB}');
      insert into storage.objects (bucket_id, name) values
        ('member-docs', '${pathFor(U.buyerA)}'), ('member-docs', '${pathFor(U.buyerB)}');
      insert into messages (member_id, sender_id, body) values
        ('${U.buyerA}', '${U.buyerA}', 'Hi, can we see 1 Fiction Rd on Saturday?'),
        ('${U.buyerA}', '${U.agentA}', 'Yes, 11 AM works.'),
        ('${U.buyerB}', '${U.buyerB}', 'Question about disclosures.');
      insert into tracked_properties (buyer_id, address, listing_key) values ('${U.buyerA}', '1 Fiction Rd', 'L-TOUR');
    `);
  });
  afterAll(() => t.close());

  describe("tour requests (review item 16)", () => {
    it("start as requested and link only the member's own account", async () => {
      expect(await t.query(`select kind, tour_status from leads order by kind, email`)).toEqual([
        { kind: "contact", tour_status: null },
        { kind: "tour", tour_status: "requested" },
        { kind: "tour", tour_status: "requested" },
      ]);
      await as("buyerA", async (q) => {
        await q(`insert into leads (kind, email, listing_key, profile_id) values ('tour', 'a2@example.test', 'L-TOUR', '${U.buyerA}')`);
      });
      await expect(as("buyerA", (q) => q(`insert into leads (kind, email, profile_id) values ('tour', 'x@example.test', '${U.buyerB}')`))).rejects.toThrow(DENIED);
      await expect(as("anon", (q) => q(`insert into leads (kind, email, profile_id) values ('tour', 'x@example.test', '${U.buyerA}')`))).rejects.toThrow(DENIED);
    });

    it("can't be created already confirmed", async () => {
      await expect(as("buyerA", (q) => q(`insert into leads (kind, email, tour_status) values ('tour', 'x@example.test', 'confirmed')`))).rejects.toThrow(DENIED);
    });

    it("members see only their own requests, without staff columns", async () => {
      const mine = await as("buyerA", (q) => q<Record<string, unknown>>(`select * from my_tour_requests()`));
      expect(mine).toHaveLength(1);
      expect(Object.keys(mine[0]!).sort()).toEqual(["created_at", "id", "listing_key", "message", "payload", "tour_confirmed_at", "tour_status"]);
      expect(await as("buyerB", (q) => q(`select listing_key from my_tour_requests()`))).toEqual([{ listing_key: "L-TOUR" }]);
      expect(await as("buyerA", (q) => q(`select * from leads`))).toEqual([]); // no direct read of leads
    });

    it("only staff who may see the member confirm a tour", async () => {
      const [{ id }] = (await t.query<{ id: string }>(`select id from leads where profile_id = $1 and kind = 'tour'`, [U.buyerA])) as [{ id: string }];
      await expect(as("buyerA", (q) => q(`select public.set_tour_status('${id}', 'confirmed')`))).rejects.toThrow(/staff_only/);
      await expect(as("agentB", (q) => q(`select public.set_tour_status('${id}', 'confirmed')`))).rejects.toThrow(/not_found/);
      await as("agentA", async (q) => {
        await q(`select public.set_tour_status('${id}', 'confirmed')`);
        await q(`set local role postgres`);
        expect(await q(`select tour_status, tour_confirmed_by::text as by from leads where id = '${id}'`)).toEqual([{ tour_status: "confirmed", by: U.agentA }]);
      });
    });
  });

  describe("buyer agreement on file (review item 16)", () => {
    it("is set by staff who may see the member, never by members or other agents", async () => {
      await expect(as("buyerA", (q) => q(`select public.set_buyer_agreement('${U.buyerA}', true)`))).rejects.toThrow(/staff_only/);
      await expect(as("agentB", (q) => q(`select public.set_buyer_agreement('${U.buyerA}', true)`))).rejects.toThrow(/staff_only/);
      await as("agentA", async (q) => {
        await q(`select public.set_buyer_agreement('${U.buyerA}', true)`);
        expect(await q(`select buyer_agreement_on_file_at is not null as on_file from profiles where id = '${U.buyerA}'`)).toEqual([{ on_file: true }]);
      });
      await expect(as("buyerA", (q) => q(`update profiles set buyer_agreement_on_file_at = now() where id = '${U.buyerA}'`))).rejects.toThrow(DENIED);
    });
  });

  describe("member documents (SEC-2, review item 8)", () => {
    const names = (who: Who) => as(who, async (q) => (await q<{ name: string }>(`select name from member_documents order by name`)).map((r) => r.name));

    it.each<[Who, string[]]>([
      ["buyerA", ["Inspection report.pdf"]],
      ["buyerB", ["Disclosures.pdf"]],
      ["agentA", ["Inspection report.pdf"]],
      ["agentB", []],
      ["admin", ["Disclosures.pdf", "Inspection report.pdf"]],
    ])("%s sees only the documents they may see", async (who, expected) => {
      expect(await names(who)).toEqual(expected);
    });

    it("anon sees nothing", async () => {
      await expect(as("anon", (q) => q(`select * from member_documents`))).rejects.toThrow(DENIED);
    });

    it("members add only to their own folder; their staff may add for them; paths must match the owner", async () => {
      await as("buyerA", (q) => q(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${U.buyerA}', 'HOA.pdf', '${pathFor(U.buyerA, "hoa.pdf")}', 10, 'application/pdf', '${U.buyerA}')`));
      await expect(
        as("buyerA", (q) => q(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${U.buyerB}', 'x', '${pathFor(U.buyerB, "x.pdf")}', 10, 'application/pdf', '${U.buyerA}')`)),
      ).rejects.toThrow(DENIED);
      await expect(
        as("buyerA", (q) => q(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${U.buyerA}', 'x', '${pathFor(U.buyerB, "x.pdf")}', 10, 'application/pdf', '${U.buyerA}')`)),
      ).rejects.toThrow(/check constraint/);
      await as("agentA", (q) => q(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${U.buyerA}', 'Agreement.pdf', '${pathFor(U.buyerA, "agreement.pdf")}', 10, 'application/pdf', '${U.agentA}')`));
      await expect(
        as("agentB", (q) => q(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${U.buyerA}', 'x', '${pathFor(U.buyerA, "y.pdf")}', 10, 'application/pdf', '${U.agentB}')`)),
      ).rejects.toThrow(DENIED);
    });

    it("refuses SVG and oversized files", async () => {
      await expect(as("buyerA", (q) => q(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${U.buyerA}', 'x.svg', '${pathFor(U.buyerA, "x.svg")}', 10, 'image/svg+xml', '${U.buyerA}')`))).rejects.toThrow(/check constraint/);
      await expect(as("buyerA", (q) => q(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${U.buyerA}', 'big.pdf', '${pathFor(U.buyerA, "big.pdf")}', 30000000, 'application/pdf', '${U.buyerA}')`))).rejects.toThrow(/check constraint/);
    });

    it("only the uploader deletes", async () => {
      expect(await as("buyerB", (q) => q(`delete from member_documents where profile_id = '${U.buyerA}' returning id`))).toEqual([]);
      expect(await as("agentA", (q) => q(`delete from member_documents where name = 'Inspection report.pdf' returning id`))).toEqual([]);
      expect((await as("buyerA", (q) => q(`delete from member_documents where name = 'Inspection report.pdf' returning id`))).length).toBe(1);
    });

    describe("member-docs bucket", () => {
      const objects = (who: Who) => as(who, async (q) => (await q<{ name: string }>(`select name from storage.objects where bucket_id = 'member-docs' order by name`)).map((r) => r.name));

      it.each<[Who, string[]]>([
        ["buyerA", [pathFor(U.buyerA)]],
        ["buyerB", [pathFor(U.buyerB)]],
        ["agentA", [pathFor(U.buyerA)]],
        ["agentB", []],
        ["anon", []],
      ])("%s sees only the files they may see", async (who, expected) => {
        expect(await objects(who)).toEqual(expected);
      });

      it("members upload and delete only in their own folder", async () => {
        await as("buyerA", (q) => q(`insert into storage.objects (bucket_id, name) values ('member-docs', '${pathFor(U.buyerA, "new.pdf")}')`));
        await expect(as("buyerA", (q) => q(`insert into storage.objects (bucket_id, name) values ('member-docs', '${pathFor(U.buyerB, "new.pdf")}')`))).rejects.toThrow(DENIED);
        await expect(as("buyerA", (q) => q(`insert into storage.objects (bucket_id, name) values ('member-docs', 'elsewhere/new.pdf')`))).rejects.toThrow(DENIED);
        expect(await as("buyerA", (q) => q(`delete from storage.objects where name = '${pathFor(U.buyerB)}' returning name`))).toEqual([]);
        expect(await as("agentA", (q) => q(`delete from storage.objects where name = '${pathFor(U.buyerA)}' returning name`))).toEqual([]);
      });
    });
  });

  describe("messages (SEC-2, review item 9)", () => {
    const bodies = (who: Who) => as(who, async (q) => (await q<{ body: string }>(`select body from messages order by id`)).map((r) => r.body));

    it.each<[Who, number]>([
      ["buyerA", 2],
      ["buyerB", 1],
      ["agentA", 2],
      ["agentB", 0],
      ["admin", 3],
    ])("%s reads only the threads they may see", async (who, n) => {
      expect(await bodies(who)).toHaveLength(n);
    });

    it("anon reads nothing", async () => {
      await expect(as("anon", (q) => q(`select * from messages`))).rejects.toThrow(DENIED);
    });

    it("senders write only as themselves, to their own thread or one they may see", async () => {
      await as("buyerB", (q) => q(`insert into messages (member_id, sender_id, body) values ('${U.buyerB}', '${U.buyerB}', 'Thanks!')`));
      await expect(as("buyerB", (q) => q(`insert into messages (member_id, sender_id, body) values ('${U.buyerA}', '${U.buyerB}', 'Hi')`))).rejects.toThrow(DENIED);
      await expect(as("buyerB", (q) => q(`insert into messages (member_id, sender_id, body) values ('${U.buyerB}', '${U.agentB}', 'Forged')`))).rejects.toThrow(DENIED);
      await expect(as("agentB", (q) => q(`insert into messages (member_id, sender_id, body) values ('${U.buyerA}', '${U.agentB}', 'Hi')`))).rejects.toThrow(DENIED);
      await as("agentA", (q) => q(`insert into messages (member_id, sender_id, body) values ('${U.buyerA}', '${U.agentA}', 'See you Saturday.')`));
    });

    it("can't be edited or deleted by members, and must not be empty", async () => {
      await expect(as("buyerA", (q) => q(`update messages set body = 'x'`))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`delete from messages`))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`insert into messages (member_id, sender_id, body) values ('${U.buyerA}', '${U.buyerA}', '   ')`))).rejects.toThrow(/check constraint/);
    });

    it("mark_messages_read marks only the other side's messages, in a thread the caller may see", async () => {
      await as("buyerA", async (q) => {
        expect((await q<{ n: number }>(`select public.mark_messages_read('${U.buyerA}') as n`))[0]!.n).toBe(1); // agentA's reply, not their own message
      });
      await expect(as("agentB", (q) => q(`select public.mark_messages_read('${U.buyerA}')`))).rejects.toThrow(/not_allowed/);
      await as("agentA", async (q) => {
        expect((await q<{ n: number }>(`select public.mark_messages_read('${U.buyerA}') as n`))[0]!.n).toBe(1); // buyerA's message
      });
    });

    it("rate-limits a sender to 20 messages in 10 minutes", async () => {
      await as("buyerB", async (q) => {
        // One seeded message + 19 here = 20 in the window; the next is refused.
        for (let i = 0; i < 19; i++) await q(`insert into messages (member_id, sender_id, body) values ('${U.buyerB}', '${U.buyerB}', 'm${i}')`);
        await expect(q(`insert into messages (member_id, sender_id, body) values ('${U.buyerB}', '${U.buyerB}', 'one too many')`)).rejects.toThrow(/messages_rate_limited/);
      });
    });
  });

  describe("tracker cleanup (review item 5)", () => {
    it("clears the MLS link when the listing leaves the feed, keeping the member's own record", async () => {
      await t.query(`delete from mls_listings where listing_key = 'L-TOUR'`);
      expect(await t.query(`select address, listing_key from tracked_properties`)).toEqual([{ address: "1 Fiction Rd", listing_key: null }]);
    });
  });
});

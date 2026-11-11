import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// S6 PR 4 (0024): content revisions with approval, agent photos and
// featured listings. Fictional people, copy and listings only.

const U = {
  mark: "a1000000-0000-4000-8000-0000000008a1",
  viv: "b1000000-0000-4000-8000-0000000008b1",
  agent: "c1000000-0000-4000-8000-0000000008c1",
  va: "d1000000-0000-4000-8000-0000000008d1",
  admin2: "e1000000-0000-4000-8000-0000000008e1",
  member: "f1000000-0000-4000-8000-0000000008f1",
} as const;
type Who = keyof typeof U;

const GUIDE = { intro: "Fictional San Carlos intro.", neighborhoods: [{ name: "Example Heights", summary: "Tree-lined streets near the library." }], school_links: [], faq: [] };
const POST = { kind: "insight", title: "A fictional insight", excerpt: "Short.", body_md: "Some **fictional** body." };
const QUOTE = { author_display: "Sam Q.", role: "buyer", quote: "Fictional quote.", source: "Email, Nov 2026", permission_confirmed: true };

describe("content review, agent photos, featured listings (0024)", () => {
  let t: TestDb;
  // Runs as the API role with grants and RLS, and keeps what it writes.
  const act = async <T>(who: Who, sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[who]]);
    await t.exec(`set role authenticated`);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.exec(`reset role`);
      await t.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const draft = async (who: Who, table: string, key: string | null, body: object, rev: string | null = null) =>
    (await act<{ id: string }>(who, `select save_content_draft($1, $2, $3, $4) as id`, [rev, table, key, JSON.stringify(body)]))[0]!.id;
  const submit = (who: Who, rev: string) => act(who, `select submit_content($1)`, [rev]);
  const publish = async (who: Who, rev: string) => (await act<{ k: string }>(who, `select publish_content($1) as k`, [rev]))[0]!.k;
  const status = async (rev: string) => (await t.query<{ status: string }>(`select status from content_revisions where id = $1`, [rev]))[0]!.status;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.mark, { role: "admin" });
    await createUser(t, U.viv, { role: "agent" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.admin2, { role: "admin" });
    await createUser(t, U.member, { role: "buyer" });
    await t.exec(`update app_settings set lead_admin_id = '${U.mark}', backup_admin_id = '${U.viv}'`);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from content_revisions; delete from staff_audit; update app_settings set lead_admin_away = false`);
  });

  describe("approval", () => {
    it("staff draft and submit; only the acting lead admin publishes", async () => {
      const rev = await draft("agent", "city_guides", "san-carlos", GUIDE);
      await submit("agent", rev);
      for (const who of ["agent", "va", "admin2", "viv"] as const) {
        await expect(publish(who, rev)).rejects.toThrow(/lead_admin_only/);
      }
      await expect(act("member", `select publish_content($1)`, [rev])).rejects.toThrow(/lead_admin_only/);
      expect(await publish("mark", rev)).toBe("san-carlos");
      const live = await t.query(`select intro, published, is_placeholder, approved_by from city_guides where city_slug = 'san-carlos'`);
      expect(live).toEqual([{ intro: GUIDE.intro, published: true, is_placeholder: false, approved_by: U.mark }]);
      expect(await status(rev)).toBe("published");
      expect(await t.query(`select action, ref_table, ref_id from staff_audit`)).toEqual([
        { action: "publish_content", ref_table: "city_guides", ref_id: "san-carlos" },
      ]);
    });

    it("Viv publishes while Mark is away", async () => {
      const rev = await draft("agent", "posts", "fictional-insight", POST);
      await submit("agent", rev);
      await expect(publish("viv", rev)).rejects.toThrow(/lead_admin_only/);
      await t.exec(`update app_settings set lead_admin_away = true`);
      expect(await publish("viv", rev)).toBe("fictional-insight");
      expect(await t.query(`select title, published, is_placeholder, approved_by from posts where slug = 'fictional-insight'`)).toEqual([
        { title: POST.title, published: true, is_placeholder: false, approved_by: U.viv },
      ]);
    });

    it("members and the public can't draft", async () => {
      await expect(draft("member", "posts", "x-post", POST)).rejects.toThrow(/staff_only/);
      await expect(t.as("anon", null, (q) => q(`select save_content_draft(null, 'posts', 'x-post', '{}')`))).rejects.toThrow(/permission denied/);
      await expect(t.as("anon", null, (q) => q(`select publish_content(gen_random_uuid())`))).rejects.toThrow(/permission denied/);
    });

    it("only a submitted revision is published; rejecting sends it back with a note", async () => {
      const rev = await draft("agent", "posts", "fictional-two", POST);
      await expect(publish("mark", rev)).rejects.toThrow(/not_submitted/);
      await submit("agent", rev);
      await expect(act("agent", `select reject_content($1, 'x')`, [rev])).rejects.toThrow(/lead_admin_only/);
      await act("mark", `select reject_content($1, $2)`, [rev, "Please add a source for the figures."]);
      expect(await t.query(`select status, review_note from content_revisions where id = $1`, [rev])).toEqual([
        { status: "rejected", review_note: "Please add a source for the figures." },
      ]);
      await expect(publish("mark", rev)).rejects.toThrow(/not_submitted/);
      // The author fixes it and resubmits.
      await draft("agent", "posts", "fictional-two", { ...POST, excerpt: "Now sourced." }, rev);
      expect(await status(rev)).toBe("draft");
      await submit("agent", rev);
      await publish("mark", rev);
      expect(await t.query(`select excerpt from posts where slug = 'fictional-two'`)).toEqual([{ excerpt: "Now sourced." }]);
    });

    it("a submitted or published revision can't be edited, and only its author (or Mark) edits a draft", async () => {
      const rev = await draft("agent", "posts", "fictional-three", POST);
      await expect(draft("va", "posts", "fictional-three", POST, rev)).rejects.toThrow(/not_allowed/);
      await expect(submit("va", rev)).rejects.toThrow(/not_allowed/);
      await draft("mark", "posts", "fictional-three", { ...POST, title: "Edited by Mark" }, rev);
      await expect(draft("agent", "testimonials", null, QUOTE, rev)).rejects.toThrow(/wrong_table/);
      await submit("agent", rev);
      await expect(draft("agent", "posts", "fictional-three", POST, rev)).rejects.toThrow(/not_editable/);
      await expect(submit("agent", rev)).rejects.toThrow(/not_editable/);
      await publish("mark", rev);
      await expect(draft("mark", "posts", "fictional-three", POST, rev)).rejects.toThrow(/not_editable/);
    });

    it("the live page doesn't change while a revision is draft, submitted or rejected", async () => {
      const before = await t.query(`select intro, published from city_guides where city_slug = 'redwood-city'`);
      const rev = await draft("agent", "city_guides", "redwood-city", { ...GUIDE, intro: "Draft only." });
      await submit("agent", rev);
      await act("mark", `select reject_content($1, null)`, [rev]);
      expect(await t.query(`select intro, published from city_guides where city_slug = 'redwood-city'`)).toEqual(before);
      const pub = await t.as("anon", null, (q) => q(`select intro from city_guides where intro = 'Draft only.'`));
      expect(pub).toEqual([]);
    });

    it("unpublishing takes a page down (acting lead admin only, audited)", async () => {
      const rev = await draft("agent", "posts", "fictional-four", POST);
      await submit("agent", rev);
      await publish("mark", rev);
      expect(await t.as("anon", null, (q) => q(`select slug from posts where slug = 'fictional-four'`))).toEqual([{ slug: "fictional-four" }]);
      await expect(act("agent", `select unpublish_content('posts', 'fictional-four')`)).rejects.toThrow(/lead_admin_only/);
      await act("mark", `select unpublish_content('posts', 'fictional-four')`);
      expect(await t.as("anon", null, (q) => q(`select slug from posts where slug = 'fictional-four'`))).toEqual([]);
      expect((await t.query<{ action: string }>(`select action from staff_audit order by created_at`)).map((r) => r.action)).toEqual([
        "publish_content",
        "unpublish_content",
      ]);
    });

    it("staff read revisions; members and the public don't", async () => {
      await draft("agent", "posts", "fictional-five", POST);
      expect((await t.as("authenticated", U.va, (q) => q(`select id from content_revisions`))).length).toBe(1);
      expect(await t.as("authenticated", U.member, (q) => q(`select id from content_revisions`))).toEqual([]);
      await expect(t.as("anon", null, (q) => q(`select id from content_revisions`))).rejects.toThrow(/permission denied/);
      await expect(t.as("authenticated", U.mark, (q) => q(`update content_revisions set status = 'published'`))).rejects.toThrow(/permission denied/);
    });
  });

  describe("whitelist and validation", () => {
    it("only the three content tables exist as targets", async () => {
      await expect(draft("agent", "agent_profiles", "mark-martinho", {})).rejects.toThrow(/invalid input value for enum/);
      await expect(draft("agent", "profiles; drop table leads", "x", {})).rejects.toThrow(/invalid input value for enum/);
    });

    it("checks each table's body and key", async () => {
      await expect(draft("agent", "city_guides", "atlantis", GUIDE)).rejects.toThrow(/invalid_city_slug/);
      await expect(draft("agent", "city_guides", "san-carlos", { intro: 5 })).rejects.toThrow(/invalid_intro/);
      await expect(draft("agent", "posts", "Bad Slug", POST)).rejects.toThrow(/invalid_slug/);
      await expect(draft("agent", "posts", "ok-slug", { ...POST, kind: "ad" })).rejects.toThrow(/invalid_kind/);
      await expect(draft("agent", "posts", "ok-slug", { ...POST, body_md: "" })).rejects.toThrow(/invalid_body_md/);
      await expect(draft("agent", "testimonials", "not-a-uuid", QUOTE)).rejects.toThrow(/bad_key/);
      await expect(draft("agent", "testimonials", null, { ...QUOTE, author_display: "" })).rejects.toThrow(/invalid_author_display/);
    });
  });

  describe("testimonials", () => {
    it("need a source and the client's permission to publish", async () => {
      for (const body of [{ ...QUOTE, source: "" }, { ...QUOTE, permission_confirmed: false }]) {
        const rev = await draft("agent", "testimonials", null, body);
        await submit("agent", rev);
        await expect(publish("mark", rev)).rejects.toThrow(/testimonial_needs_source_and_permission/);
      }
      const rev = await draft("agent", "testimonials", null, QUOTE);
      await submit("agent", rev);
      const id = await publish("mark", rev);
      expect(await t.query(`select author_display, source, permission_confirmed, published, is_placeholder from testimonials where id = $1`, [id])).toEqual([
        { author_display: "Sam Q.", source: "Email, Nov 2026", permission_confirmed: true, published: true, is_placeholder: false },
      ]);
      expect(await t.query(`select row_key from content_revisions where id = $1`, [rev])).toEqual([{ row_key: id }]);
    });

    it("replacing a placeholder clears is_placeholder", async () => {
      const ph = (await t.query<{ id: string }>(`select id from testimonials where is_placeholder order by sort limit 1`))[0]!.id;
      const rev = await draft("agent", "testimonials", ph, { ...QUOTE, quote: "Replaces the placeholder." });
      await submit("agent", rev);
      await publish("mark", rev);
      expect(await t.query(`select quote, is_placeholder, published from testimonials where id = $1`, [ph])).toEqual([
        { quote: "Replaces the placeholder.", is_placeholder: false, published: true },
      ]);
    });
  });

  describe("agent photos bucket", () => {
    const upload = (who: Who | null, name: string) =>
      t.as(who ? "authenticated" : "anon", who ? U[who] : null, (q) =>
        q(`insert into storage.objects (bucket_id, name) values ('agent-photos', $1) returning name`, [name]),
      );

    it("is public, and staff upload only into their own folder", async () => {
      expect(await t.query(`select public from storage.buckets where id = 'agent-photos'`)).toEqual([{ public: true }]);
      expect(await upload("agent", `${U.agent}/headshot.jpg`)).toEqual([{ name: `${U.agent}/headshot.jpg` }]);
      await expect(upload("agent", `${U.viv}/headshot.jpg`)).rejects.toThrow(/row-level security/);
      await expect(upload("member", `${U.member}/headshot.jpg`)).rejects.toThrow(/row-level security/);
      await expect(upload(null, `${U.agent}/headshot.jpg`)).rejects.toThrow(/row-level security/);
    });

    it("lets staff replace or delete only their own photos", async () => {
      await t.query(`insert into storage.objects (bucket_id, name) values ('agent-photos', $1), ('agent-photos', $2)`, [`${U.agent}/a.jpg`, `${U.viv}/b.jpg`]);
      const del = (who: Who) => t.as("authenticated", U[who], (q) => q<{ name: string }>(`delete from storage.objects where bucket_id = 'agent-photos' returning name`));
      expect(await del("agent")).toEqual([{ name: `${U.agent}/a.jpg` }]);
      expect(await del("member")).toEqual([]);
    });

    it("photo_path must look like <uuid>/<file name>", async () => {
      await expect(t.query(`update agent_profiles set photo_path = '../../etc/passwd' where slug = 'mark-martinho'`)).rejects.toThrow(/photo_path_check/);
      await t.query(`update agent_profiles set photo_path = $1 where slug = 'mark-martinho'`, [`${U.agent}/headshot-1.webp`]);
    });

    it("an agent sets a photo only from their own folder", async () => {
      await t.query(`update agent_profiles set profile_id = $1, photo_path = null where slug = 'viv-kelvin'`, [U.viv]);
      await expect(act("viv", `update agent_profiles set photo_path = $1 where slug = 'viv-kelvin'`, [`${U.agent}/headshot-1.webp`])).rejects.toThrow(/photo_not_yours/);
      await act("viv", `update agent_profiles set photo_path = $1, bio = 'Fictional bio.', is_placeholder = false where slug = 'viv-kelvin'`, [`${U.viv}/headshot.jpg`]);
      expect(await t.query(`select photo_path, is_placeholder from agent_profiles where slug = 'viv-kelvin'`)).toEqual([{ photo_path: `${U.viv}/headshot.jpg`, is_placeholder: false }]);
    });
  });

  describe("featured listings", () => {
    beforeAll(async () => {
      await t.exec(`
        insert into mls_listings (listing_key, listing_id, standard_status, property_sub_type, list_price, city, county, list_office_name, list_office_mls_id, is_own_listing, address_display, modification_ts, data) values
          ('F-ACTIVE', 'F1', 'Active', 'Single Family Residence', 1900000, 'San Carlos', 'San Mateo', 'Vabrato', 'VABRA', true, true, now(), '{"StreetNumber":"9","StreetName":"Fiction","StreetSuffix":"Ln"}'),
          ('F-SOLD', 'F2', 'Closed', 'Single Family Residence', 2100000, 'San Carlos', 'San Mateo', 'Vabrato', 'VABRA', true, true, now(), '{}')
        on conflict do nothing`);
    });
    beforeEach(async () => {
      await t.exec(`delete from featured_listings`);
    });

    it("staff pin listings; members and the public can't", async () => {
      await act("agent", `insert into featured_listings (listing_key, sort) values ('F-ACTIVE', 1)`);
      expect(await t.query(`select created_by from featured_listings`)).toEqual([{ created_by: U.agent }]);
      await expect(act("member", `insert into featured_listings (listing_key) values ('F-SOLD')`)).rejects.toThrow(/row-level security/);
      await expect(t.as("anon", null, (q) => q(`insert into featured_listings (listing_key) values ('F-SOLD')`))).rejects.toThrow(/permission denied/);
      await expect(act("va", `insert into featured_listings (listing_key, created_by) values ('F-SOLD', $1)`, [U.agent])).rejects.toThrow(/row-level security/);
    });

    it("the public sees a pin only in its window and only for an IDX-visible listing", async () => {
      await t.exec(`insert into featured_listings (listing_key, sort, starts_at, ends_at) values
        ('F-ACTIVE', 1, now() - interval '1 day', now() + interval '1 day'),
        ('F-SOLD', 2, null, null)`);
      const pub = () => t.as("anon", null, (q) => q<{ listing_key: string }>(`select listing_key from featured_listings order by sort`));
      expect(await pub()).toEqual([{ listing_key: "F-ACTIVE" }]);
      await t.exec(`update featured_listings set ends_at = now() - interval '1 hour', starts_at = now() - interval '2 days' where listing_key = 'F-ACTIVE'`);
      expect(await pub()).toEqual([]);
      // Staff still see every pin, to manage them.
      expect((await t.as("authenticated", U.va, (q) => q(`select listing_key from featured_listings`))).length).toBe(2);
    });

    it("anon card data for pins stays IDX: for-sale only, no sold rows", async () => {
      const rows = await t.as("anon", null, (q) => q<{ listing_key: string }>(`select listing_key from listing_cards(array['F-ACTIVE','F-SOLD'])`));
      expect(rows).toEqual([{ listing_key: "F-ACTIVE" }]);
    });
  });
});

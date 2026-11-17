// Demo content: a FICTIONAL small office, so the team can click through every
// part of the product before launch (owner request 2026-11-17). Prints SQL,
// like seed-preview.ts; nothing here connects to a database.
//
//   pnpm --filter @vabrato/mls exec tsx src/jobs/seed-demo.ts [--date 2026-11-17] > demo.sql
//   pnpm --filter @vabrato/mls exec tsx src/jobs/seed-demo.ts --purge > purge.sql
//   pnpm --filter @vabrato/mls exec tsx src/jobs/seed-demo.ts --check > check.sql
//   (locally, name the accounts: --agent <email> --buyer <email> --seller <email> --va <email>)
//
// Rules (see docs/STATUS.md, "Demo content"):
// - Everything is invented: people use @example.test addresses and 555
//   numbers, addresses end in "(Demo)", messages to the real test accounts
//   start with "[Demo]". No bank or wiring details. Testimonials aren't touched.
// - Every row we create has an id starting with DEMO_PREFIX, so --purge
//   finds it. Rows without an id of ours (saved homes, views, pins) are found
//   by their fixed keys.
// - No email is sent: leads, messages and to-dos queue notifications from
//   triggers; the seed deletes every notification (and staff bell entry) it
//   caused, in the same transaction, before the sender is poked after commit.
//   Leads left "new" are marked escalated so the minute sweep never emails.
// - The owner's test accounts are found by role when the SQL runs (exactly
//   one agent, buyer and seller; it stops otherwise). Their emails and ids
//   never go in the repo.
// - It needs the fictional preview listings (seed-preview.ts) first.
// - Deals: ordinary ones go on the team Google Calendar at the next sync; test
//   deals (deals.is_test) stay off it and are the ones AI test mode works on.

import { DEFAULT_CONTINGENCIES, computeCoe, generateSchedule, type ScheduleInput } from "@vabrato/lib";

type SellerType = NonNullable<ScheduleInput["sellerType"]>;

export const DEMO_PREFIX = "de300000-0000-4000-8000-";
const id = (n: number) => `${DEMO_PREFIX}${n.toString(16).padStart(12, "0")}`;

/** Fixed keys of rows that aren't ours by id (purge finds them by these). */
export const DEMO_KEYS = {
  sellerListing: "FX-001",
  featured: ["FX-001", "FX-020", "FX-024"],
  buyerSaved: ["FX-013", "FX-021"],
  guides: ["belmont", "redwood-city"],
  postPrefix: "demo-",
  messagePrefix: "[Demo]",
} as const;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const qn = (s: string | null | undefined) => (s == null ? "null" : q(s));
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The first weekday on or after `iso`. */
function weekday(iso: string): string {
  let d = iso;
  for (let i = 0; i < 3; i++) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) return d;
    d = addDays(d, 1);
  }
  return d;
}
/** A timestamp on a day, Pacific-ish (fixed -08:00; good enough for demo dates). */
const at = (iso: string, hhmm = "10:00") => q(`${iso}T${hhmm}:00-08:00`);

/** Today in California. */
export function pacificToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

interface DealSpec {
  n: number;
  address: string;
  sellerName: string | null;
  sellerType: SellerType;
  ratifiedDaysAgo: number;
  daysToClose: number;
  rentBackDays: number;
  salePrice: number;
  status: "active" | "closed" | "cancelled";
  isTest: boolean;
  listingKey?: string;
  escrow: string;
}

const DEALS: DealSpec[] = [
  { n: 1, address: "1 Fixture Way, San Carlos (Demo)", sellerName: null, sellerType: "normal", ratifiedDaysAgo: 10, daysToClose: 30, rentBackDays: 0, salePrice: 2_250_000, status: "active", isTest: false, listingKey: "FX-001", escrow: "DEMO-1001" },
  { n: 2, address: "22 Sample Court, Redwood City (Demo)", sellerName: "Morgan Sample", sellerType: "normal", ratifiedDaysAgo: 25, daysToClose: 30, rentBackDays: 0, salePrice: 1_710_000, status: "active", isTest: false, escrow: "DEMO-1002" },
  { n: 3, address: "305 Example Avenue, Belmont (Demo)", sellerName: "Pat Example", sellerType: "normal", ratifiedDaysAgo: 75, daysToClose: 30, rentBackDays: 0, salePrice: 1_985_000, status: "closed", isTest: false, escrow: "DEMO-1003" },
  { n: 4, address: "48 Placeholder Lane, San Mateo (Demo)", sellerName: "Lee Placeholder", sellerType: "normal", ratifiedDaysAgo: 20, daysToClose: 30, rentBackDays: 0, salePrice: 1_540_000, status: "cancelled", isTest: false, escrow: "DEMO-1004" },
  { n: 5, address: "9 Testcase Drive, Foster City (Demo)", sellerName: "The Example Family Trust", sellerType: "trust", ratifiedDaysAgo: 1, daysToClose: 21, rentBackDays: 0, salePrice: 1_695_000, status: "active", isTest: true, escrow: "DEMO-1005" },
  { n: 6, address: "710 Demo Street, Menlo Park (Demo)", sellerName: "Sam Example", sellerType: "normal", ratifiedDaysAgo: 12, daysToClose: 30, rentBackDays: 0, salePrice: 2_480_000, status: "active", isTest: true, escrow: "DEMO-1006" },
  { n: 7, address: "64 Fixture Road, Burlingame (Demo)", sellerName: "Jules Sample", sellerType: "normal", ratifiedDaysAgo: 20, daysToClose: 25, rentBackDays: 7, salePrice: 2_125_000, status: "active", isTest: true, escrow: "DEMO-1007" },
];
const dealId = (n: number) => id(0x100 + n);

const PEOPLE = [
  { n: 1, name: "Jamie Sample", role: "buyer", email: "jamie.sample.demo@example.test", phone: "650-555-0141" },
  { n: 2, name: "Robin Example", role: "buyer", email: "robin.example.demo@example.test", phone: "650-555-0142" },
  { n: 3, name: "Morgan Sample", role: "seller", email: "morgan.sample.demo@example.test", phone: "650-555-0143" },
  { n: 4, name: "Casey Placeholder", role: "both", email: "casey.placeholder.demo@example.test", phone: "650-555-0144" },
] as const;
const personId = (n: number) => id(0x200 + n);

const VENDORS = [
  { n: 1, name: "Example Escrow Co (Demo)", role: "Escrow", phone: "650-555-0151", email: "escrow.demo@example.test", preferred: true },
  { n: 2, name: "Sample Home Inspections (Demo)", role: "Inspector", phone: "650-555-0152", email: "inspect.demo@example.test", preferred: true },
  { n: 3, name: "Placeholder Home Loans (Demo)", role: "Lender", phone: "650-555-0153", email: "loans.demo@example.test", preferred: false },
  { n: 4, name: "Testcase Staging (Demo)", role: "Stager", phone: "650-555-0154", email: "staging.demo@example.test", preferred: true },
  { n: 5, name: "Demo Photo Studio", role: "Photographer", phone: "650-555-0155", email: "photo.demo@example.test", preferred: false },
  { n: 6, name: "Fixture Handyman (Demo)", role: "Handyman", phone: "650-555-0156", email: "handy.demo@example.test", preferred: false },
] as const;
const vendorId = (n: number) => id(0x300 + n);
const leadId = (n: number) => id(0x400 + n);

/**
 * Which accounts are the owner's test accounts. On hosted there's one per
 * role, so leave these out; a local database with many QA accounts names them
 * by email (on the command line only: never commit them).
 */
export interface DemoAccounts {
  agent?: string;
  buyer?: string;
  seller?: string;
  va?: string;
}
type Role = keyof DemoAccounts;
const DEMO_LIKE = `'${DEMO_PREFIX}%'`;
/** Rows of a role, or the named account. */
const accountWhere = (role: Role, a: DemoAccounts) =>
  a[role] ? `lower(email) = lower(${q(a[role]!)})` : `role = '${role}' and id::text not like ${DEMO_LIKE}`;
const account = (role: Role, a: DemoAccounts) => `(select id from public.profiles where ${accountWhere(role, a)} order by created_at limit 1)`;

/** The SQL that removes every demo row. Safe to run when there's none. */
export function demoPurgeSql(accounts: DemoAccounts = {}): string {
  const p = DEMO_LIKE;
  return `-- Removes the FICTIONAL demo content (packages/mls/src/jobs/seed-demo.ts).
do $demo_purge$
declare
  buyer uuid := ${account("buyer", accounts)};
begin
  delete from public.ai_drafts where id::text like ${p};
  delete from public.staff_todos where id::text like ${p};
  delete from public.deals where id::text like ${p};
  delete from public.leads where id::text like ${p};
  delete from public.vendors where id::text like ${p};
  delete from public.tracked_properties where id::text like ${p};
  delete from public.saved_searches where id::text like ${p};
  delete from public.member_todos where id::text like ${p};
  delete from public.member_drafts where id::text like ${p};
  delete from public.messages where body like ${q(`${DEMO_KEYS.messagePrefix}%`)};
  delete from public.staff_notifications where ref_id like ${p};
  delete from public.saved_homes where profile_id = buyer and listing_key in (${DEMO_KEYS.buyerSaved.map(q).join(", ")});
  delete from public.listing_views_daily where listing_key = ${q(DEMO_KEYS.sellerListing)};
  delete from public.open_house_signin_links where token::text like ${p};
  delete from public.featured_listings where created_by is null and listing_key in (${DEMO_KEYS.featured.map(q).join(", ")});
  delete from public.city_guides where city_slug in (${DEMO_KEYS.guides.map(q).join(", ")}) and is_placeholder and intro like 'Placeholder guide%';
  delete from public.posts where slug like ${q(`${DEMO_KEYS.postPrefix}%`)} and is_placeholder;
  delete from auth.users where id::text like ${p};
end
$demo_purge$;
`;
}

/** What's there now: run after the seed or the purge. */
export function demoCheckSql(): string {
  const p = DEMO_LIKE;
  return `-- Demo content check (packages/mls/src/jobs/seed-demo.ts --check).
select json_build_object(
  'deals', (select count(*) from public.deals where id::text like ${p}),
  'test_deals', (select count(*) from public.deals where id::text like ${p} and is_test),
  'tasks', (select count(*) from public.tasks t join public.deals d on d.id = t.deal_id where d.id::text like ${p}),
  'contingencies', (select count(*) from public.deal_contingencies c where c.deal_id::text like ${p}),
  'leads', (select count(*) from public.leads where id::text like ${p}),
  'appointments', (select count(*) from public.ai_drafts where id::text like ${p} and kind = 'appointment'),
  'people', (select count(*) from public.profiles where id::text like ${p}),
  'vendors', (select count(*) from public.vendors where id::text like ${p}),
  'receipts', (select count(*) from public.receipts r where r.deal_id::text like ${p}),
  'messages', (select count(*) from public.messages where body like ${q(`${DEMO_KEYS.messagePrefix}%`)} or member_id::text like ${p}),
  'tracked', (select count(*) from public.tracked_properties where id::text like ${p}),
  'guides', (select count(*) from public.city_guides where city_slug in (${DEMO_KEYS.guides.map(q).join(", ")}) and intro like 'Placeholder guide%'),
  'posts', (select count(*) from public.posts where slug like ${q(`${DEMO_KEYS.postPrefix}%`)}),
  'queued_emails_for_demo', (select count(*) from public.notifications n where n.status = 'scheduled' and (
      n.deal_id::text like ${p} or n.recipient_profile_id::text like ${p}
      or n.payload::text like '%${DEMO_PREFIX}%' or n.dedupe_key like '%${DEMO_PREFIX}%')),
  'non_example_emails', (select count(*) from auth.users where id::text like ${p} and email not like '%@example.test')
    + (select count(*) from public.leads where id::text like ${p} and email not like '%@example.test' and profile_id is null)
    + (select count(*) from public.vendors where id::text like ${p} and email not like '%@example.test')
) as demo;
`;
}

export function demoSeedSql(opts: { today?: string; accounts?: DemoAccounts } = {}): string {
  const accts = opts.accounts ?? {};
  const today = opts.today ?? pacificToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("today must be yyyy-mm-dd");
  const d = (n: number) => addDays(today, n);
  const s: string[] = [];
  const out = (line: string) => s.push(line);

  // People and accounts --------------------------------------------------------------------------
  out(`  -- The owner's test accounts, by role (exactly one each of agent, buyer, seller).`);
  for (const role of ["agent", "buyer", "seller"] as const) {
    out(`  if (select count(*) from public.profiles where ${accountWhere(role, accts)}) <> 1 then raise exception 'demo_needs_exactly_one_${role}'; end if;`);
  }
  out(`  if not exists (select 1 from public.mls_listings where listing_key = ${q(DEMO_KEYS.sellerListing)}) then raise exception 'demo_needs_preview_listings'; end if;`);
  out(`  agent := ${account("agent", accts)};`);
  out(`  buyer := ${account("buyer", accts)};`);
  out(`  seller := ${account("seller", accts)};`);
  out(`  va := ${account("va", accts)};`);
  out(`  -- The buyer and seller test accounts are the agent's clients (only if nobody is set).`);
  out(`  update public.profiles set agent_id = agent where id in (buyer, seller) and agent_id is null;`);
  out(`  update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id in (buyer, seller);`);
  for (const p of PEOPLE) {
    out(`  insert into auth.users (id, email, raw_user_meta_data) values (${q(personId(p.n))}, ${q(p.email)}, ${json({ full_name: p.name })});`);
    out(
      `  update public.profiles set role = ${q(p.role)}, full_name = ${q(p.name)}, phone = ${q(p.phone)}, agent_id = agent, onboarded_at = ${at(d(-40 + p.n * 3))}, created_at = ${at(d(-40 + p.n * 3))} where id = ${q(personId(p.n))};`,
    );
  }

  // Supabase Auth reads these as strings; rows inserted by SQL leave them null, which breaks its
  // user lookups (and the dashboard's user list). Fill whichever columns this database has.
  out(`  for col in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'email_change', 'phone_change', 'phone_change_token', 'reauthentication_token') loop`);
  out(`    execute format('update auth.users set %I = coalesce(%I, %L) where id::text like %L', col, col, '', ${q(`${DEMO_PREFIX}%`)});`);
  out(`  end loop;`);
  out(`  for col in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name in ('aud', 'role') loop`);
  out(`    execute format('update auth.users set %I = coalesce(%I, %L) where id::text like %L', col, col, 'authenticated', ${q(`${DEMO_PREFIX}%`)});`);
  out(`  end loop;`);
  out(`  for col in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name in ('created_at', 'updated_at') loop`);
  out(`    execute format('update auth.users set %I = coalesce(%I, now()) where id::text like %L', col, col, ${q(`${DEMO_PREFIX}%`)});`);
  out(`  end loop;`);
  out(`  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_app_meta_data') then`);
  out(`    execute format('update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, %L::jsonb) where id::text like %L', '{"provider":"email","providers":["email"]}', ${q(`${DEMO_PREFIX}%`)});`);
  out(`  end if;`);
  out(`  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then`);
  out(`    execute format('update auth.users set instance_id = coalesce(instance_id, %L::uuid) where id::text like %L', '00000000-0000-0000-0000-000000000000', ${q(`${DEMO_PREFIX}%`)});`);
  out(`  end if;`);

  // Vendors --------------------------------------------------------------------------------------
  for (const v of VENDORS) {
    out(`  insert into public.vendors (id, name, role, phone, email, preferred) values (${q(vendorId(v.n))}, ${q(v.name)}, ${q(v.role)}, ${q(v.phone)}, ${q(v.email)}, ${v.preferred});`);
  }

  // Deals, built like createDealAction (schedule engine) -----------------------------------------
  for (const deal of DEALS) {
    const ratified = d(-deal.ratifiedDaysAgo);
    const sched = generateSchedule({ ratificationDate: ratified, daysToClose: deal.daysToClose, sellerType: deal.sellerType, rentBackDays: deal.rentBackDays });
    const did = dealId(deal.n);
    out(
      `  insert into public.deals (id, address, escrow_number, seller_name, seller_type, ratification_date, days_to_close, rent_back_days, sale_price, status, agent_id, created_by, created_at, listing_key, is_test) values (${q(did)}, ${q(deal.address)}, ${q(deal.escrow)}, ${qn(deal.sellerName)}, ${q(deal.sellerType)}, ${q(ratified)}, ${deal.daysToClose}, ${deal.rentBackDays}, ${deal.salePrice}, ${q(deal.status)}, agent, agent, ${at(ratified, "09:00")}, ${qn(deal.listingKey)}, ${deal.isTest});`,
    );
    // Done: everything due before today (all of it on a closed deal; nothing after the cancellation).
    const doneBy = deal.status === "closed" ? "9999-12-31" : today;
    const cancelledAt = deal.status === "cancelled" ? d(-6) : null;
    for (const t of sched.tasks) {
      const done = t.dueDate < doneBy && (!cancelledAt || t.dueDate < cancelledAt);
      out(
        `  insert into public.tasks (deal_id, title, owner, phase, offset_days, due_date, done, done_at) values (${q(did)}, ${q(t.title)}, ${q(t.owner)}, ${q(t.phase)}, ${t.offsetDays}, ${q(t.dueDate)}, ${done}, ${done ? at(t.dueDate, "15:00") : "null"});`,
      );
    }
    for (const c of sched.timeline.contingencyRemovals) {
      const removed = c.dueDate < today && deal.status !== "cancelled";
      out(
        `  insert into public.deal_contingencies (deal_id, kind, offset_days, due_date, removed_at) values (${q(did)}, ${q(c.kind)}, ${DEFAULT_CONTINGENCIES.find((x) => x.kind === c.kind)?.offsetDays ?? 0}, ${q(c.dueDate)}, ${removed ? at(c.dueDate, "16:00") : "null"});`,
      );
    }
    if (deal.status === "closed" && computeCoe(ratified, deal.daysToClose) >= today) throw new Error(`deal ${deal.n} isn't closed yet`);
  }
  // Who's on which deal: the seller test account sells deal 1; a fictional seller sells deal 2; the VA helps on 1, 2 and 6.
  out(`  insert into public.deal_members (deal_id, profile_id, member_role) values (${q(dealId(1))}, seller, 'seller'), (${q(dealId(2))}, ${q(personId(3))}, 'seller');`);
  out(`  if va is not null then insert into public.deal_members (deal_id, profile_id, member_role) values (${q(dealId(1))}, va, 'va'), (${q(dealId(2))}, va, 'va'), (${q(dealId(6))}, va, 'va'); end if;`);
  out(
    `  insert into public.deal_vendors (deal_id, vendor_id, confirmed) values (${q(dealId(1))}, ${q(vendorId(1))}, true), (${q(dealId(1))}, ${q(vendorId(2))}, true), (${q(dealId(1))}, ${q(vendorId(4))}, false), (${q(dealId(2))}, ${q(vendorId(1))}, true), (${q(dealId(2))}, ${q(vendorId(3))}, true), (${q(dealId(6))}, ${q(vendorId(2))}, true), (${q(dealId(6))}, ${q(vendorId(5))}, true), (${q(dealId(6))}, ${q(vendorId(6))}, false);`,
  );
  const receipts: [number, string, number, string, number][] = [
    [1, "Testcase Staging (Demo)", 1850, "Staging", -9],
    [1, "Demo Photo Studio", 425, "Photography", -8],
    [1, "Sample Print Shop (Demo)", 162.4, "Marketing", -7],
    [2, "Sample Home Inspections (Demo)", 650, "Inspection", -20],
    [2, "Example Cleaners (Demo)", 380, "Cleaning", -3],
    [6, "Demo Photo Studio", 395, "Photography", -11],
    [6, "Fixture Handyman (Demo)", 720, "Repairs", -5],
    [6, "Sample Print Shop (Demo)", 98.75, "Marketing", -4],
  ];
  receipts.forEach(([n, vendor, amount, category, day], i) => {
    out(
      `  insert into public.receipts (id, deal_id, vendor, receipt_date, amount, category, source, created_by) values (${q(id(0x500 + i))}, ${q(dealId(n))}, ${q(vendor)}, ${q(d(day))}, ${amount}, ${q(category)}, 'manual', agent);`,
    );
  });
  // 35 days of listing views on the seller's listing (the seller portal's performance chart).
  out(
    `  insert into public.listing_views_daily (listing_key, day, views) select ${q(DEMO_KEYS.sellerListing)}, g::date, 12 + (extract(doy from g)::int * 7) % 23 from generate_series(${q(d(-35))}::date, ${q(d(-1))}::date, interval '1 day') g on conflict (listing_key, day) do nothing;`,
  );

  // Leads ----------------------------------------------------------------------------------------
  type Lead = { n: number; kind: string; name: string; email: string; phone?: string; message?: string; listing?: string; city?: string; payload?: object; site?: string; daysAgo: number; status: "new" | "assigned" | "closed"; to?: "agent" | "va"; reply?: number; closed?: string; profile?: string };
  const leads: Lead[] = [
    { n: 1, kind: "contact", name: "Taylor Example", email: "taylor.example.demo@example.test", phone: "650-555-0161", message: "Hi, we're thinking about selling next spring and want to understand the process. (Demo)", daysAgo: 0, status: "new" },
    { n: 2, kind: "valuation", name: "Jordan Placeholder", email: "jordan.placeholder.demo@example.test", phone: "650-555-0162", message: "What could our 3-bed in White Oaks sell for? (Demo)", city: "san-carlos", payload: { address: "17 Sample Street, San Carlos (Demo)" }, daysAgo: 4, status: "assigned", to: "agent", reply: 1 },
    { n: 3, kind: "tour", name: "", email: "", message: "Could we see it Saturday morning? (Demo)", listing: "FX-022", daysAgo: 2, status: "assigned", to: "agent", reply: 1, profile: "buyer" },
    { n: 4, kind: "newsletter", name: "Alex Sample", email: "alex.sample.demo@example.test", daysAgo: 12, status: "closed", to: "agent", closed: "Newsletter sign-up only (Demo)" },
    { n: 5, kind: "tour", name: "Jamie Sample", email: "jamie.sample.demo@example.test", phone: "650-555-0141", message: "Interested in a weekday showing. (Demo)", listing: "FX-020", daysAgo: 6, status: "assigned", to: "va", reply: 1, profile: "p1" },
    { n: 6, kind: "contact", name: "Drew Example", email: "drew.example.demo@example.test", message: "Question about a San Carlos Life article. (Demo)", site: "sancarloslife", daysAgo: 9, status: "assigned", to: "agent", reply: 2 },
    { n: 7, kind: "open_house_signin", name: "Quinn Sample", email: "quinn.sample.demo@example.test", phone: "650-555-0167", listing: DEMO_KEYS.sellerListing, payload: { open_house_key: "OH-001", has_agent: "no" }, daysAgo: 3, status: "assigned", to: "agent", reply: 1 },
    { n: 8, kind: "open_house_signin", name: "Reese Example", email: "reese.example.demo@example.test", listing: DEMO_KEYS.sellerListing, payload: { open_house_key: "OH-001", has_agent: "yes" }, daysAgo: 3, status: "closed", to: "agent", reply: 1, closed: "Has an agent (Demo)" },
    { n: 9, kind: "valuation", name: "Skyler Placeholder", email: "skyler.placeholder.demo@example.test", phone: "650-555-0169", city: "belmont", payload: { address: "88 Example Way, Belmont (Demo)" }, daysAgo: 0, status: "new" },
    { n: 10, kind: "contact", name: "Rowan Sample", email: "rowan.sample.demo@example.test", message: "Looking for a rental, not a purchase. (Demo)", daysAgo: 15, status: "closed", to: "agent", reply: 1, closed: "Looking to rent (Demo)" },
  ];
  for (const l of leads) {
    const lid = leadId(l.n);
    const who = l.profile === "buyer" ? "buyer" : l.profile === "p1" ? q(personId(1)) : "null";
    // The buyer test account's tour request uses its own name and email, read at run time.
    const name = l.profile === "buyer" ? "(select nullif(full_name, '') from public.profiles where id = buyer)" : q(l.name);
    const email = l.profile === "buyer" ? "(select email from public.profiles where id = buyer)" : q(l.email);
    out(
      `  insert into public.leads (id, kind, name, email, phone, message, listing_key, city_slug, payload, consent_contact, site, profile_id) values (${q(lid)}, ${q(l.kind)}, ${name}, ${email}, ${qn(l.phone)}, ${qn(l.message)}, ${qn(l.listing)}, ${qn(l.city)}, ${json(l.payload ?? {})}, true, ${q(l.site ?? "vabrato")}, ${who});`,
    );
    const created = `${at(d(-l.daysAgo), l.daysAgo === 0 ? "08:15" : "11:20")}::timestamptz`;
    const assigned = l.to === "va" ? "coalesce(va, agent)" : "agent";
    out(
      `  update public.leads set created_at = ${created}, status = ${q(l.status)}, assigned_to = ${assigned}, first_reply_at = ${l.reply ? `${created} + interval '${l.reply} hours'` : "null"}, escalated_at = ${l.status === "new" ? `${created} + interval '2 hours'` : "null"}, closed_reason = ${qn(l.closed)}${l.kind === "tour" && l.status === "assigned" ? `, tour_status = 'confirmed', tour_confirmed_at = ${created} + interval '1 hour', tour_confirmed_by = ${assigned}` : ""} where id = ${q(lid)};`,
    );
  }
  out(`  insert into public.lead_notes (lead_id, author_id, body, created_at) values (${q(leadId(2))}, agent, 'Called back; wants a pricing range by Friday. Pulling comps. (Demo)', ${at(d(-3))}), (${q(leadId(5))}, coalesce(va, agent), 'Confirmed Tuesday 2pm with the listing agent. (Demo)', ${at(d(-5))}), (${q(leadId(7))}, agent, 'Liked the kitchen; asked about HOA. Follow up next week. (Demo)', ${at(d(-2))});`);
  const todos: [number, "lead" | "deal", number, string, number, boolean][] = [
    [1, "lead", 2, "Send a pricing range (Demo)", 1, false],
    [2, "deal", 1, "Confirm appraisal access with the seller (Demo)", 2, false],
    [3, "deal", 6, "Order HOA documents (Demo)", -2, true],
    [4, "deal", 2, "Book final walkthrough (Demo)", 0, false],
  ];
  for (const [n, kind, ref, title, due, done] of todos) {
    out(
      `  insert into public.staff_todos (id, lead_id, deal_id, title, due_date, done, done_at, source, created_by) values (${q(id(0x600 + n))}, ${kind === "lead" ? q(leadId(ref)) : "null"}, ${kind === "deal" ? q(dealId(ref)) : "null"}, ${q(title)}, ${q(d(due))}, ${done}, ${done ? at(d(due)) : "null"}, 'manual', agent);`,
    );
  }

  // Appointments (approved, so the team calendar shows the ones on ordinary deals and leads) ------
  type Appt = { n: number; on: "deal" | "lead"; ref: number; title: string; day: number; start: string; minutes: number; location: string; with: string; owner?: "va"; draft?: boolean };
  const appts: Appt[] = [
    { n: 1, on: "deal", ref: 1, title: "Appraisal access", day: 3, start: "10:00", minutes: 60, location: "1 Fixture Way, San Carlos (Demo)", with: "Appraiser (Demo)" },
    { n: 2, on: "deal", ref: 2, title: "Final walkthrough", day: 2, start: "16:00", minutes: 45, location: "22 Sample Court, Redwood City (Demo)", with: "Buyers and their agent (Demo)" },
    { n: 3, on: "lead", ref: 2, title: "Listing consultation", day: 5, start: "11:00", minutes: 60, location: "17 Sample Street, San Carlos (Demo)", with: "Jordan Placeholder" },
    { n: 4, on: "deal", ref: 6, title: "Home inspection", day: 4, start: "09:00", minutes: 120, location: "710 Demo Street, Menlo Park (Demo)", with: "Sample Home Inspections (Demo)" },
    { n: 5, on: "lead", ref: 5, title: "Showing", day: 6, start: "14:00", minutes: 30, location: "Foster City (Demo)", with: "Jamie Sample", owner: "va" },
    { n: 6, on: "deal", ref: 7, title: "Rent-back check-in", day: 9, start: "15:30", minutes: 30, location: "64 Fixture Road, Burlingame (Demo)", with: "Jules Sample" },
    { n: 7, on: "lead", ref: 1, title: "Intro call", day: 1, start: "12:30", minutes: 20, location: "Phone", with: "Taylor Example", draft: true },
  ];
  for (const a of appts) {
    const date = weekday(d(a.day));
    const content = { title: a.title, date, start: a.start, minutes: a.minutes, location: a.location, with: a.with };
    const body = `Hi ${a.with.split(" ")[0]}, confirming ${a.title.toLowerCase()} on [when] at ${a.location}. (Demo)`;
    out(
      `  insert into public.ai_drafts (id, owner_id, kind, lead_id, deal_id, subject, body, status, approved_at, content, created_at) values (${q(id(0x700 + a.n))}, ${a.owner === "va" ? "coalesce(va, agent)" : "agent"}, 'appointment', ${a.on === "lead" ? q(leadId(a.ref)) : "null"}, ${a.on === "deal" ? q(dealId(a.ref)) : "null"}, ${q(`${a.title} (Demo)`)}, ${q(body)}, ${a.draft ? "'draft'" : "'approved'"}, ${a.draft ? "null" : "now()"}, ${json(content)}, now());`,
    );
  }

  // The buyer test account's activity ----------------------------------------------------------------
  const tracked: [number, string, string, [string, number][]][] = [
    [1, "FX-002", "toured", [["Toured", -5], ["Price reduced (Demo)", -2]]],
    [2, "FX-022", "watching", [["Tour requested", -2]]],
    [3, "FX-020", "offer_made", [["Offer submitted (Demo)", -1]]],
  ];
  for (const [n, key, status, events] of tracked) {
    const tid = id(0x800 + n);
    out(
      `  insert into public.tracked_properties (id, buyer_id, address, source, status, created_at, listing_key) select ${q(tid)}, buyer, coalesce(case when address_display then data ->> 'UnparsedAddress' end, 'Address withheld by the listing') || ' (Demo)', 'website', ${q(status)}, ${at(d(-14 + n))}, listing_key from public.mls_listings where listing_key = ${q(key)};`,
    );
    events.forEach(([kind, day], i) => {
      out(`  insert into public.property_events (id, tracked_property_id, kind, payload, occurred_at) select ${q(id(0x880 + n * 8 + i))}, ${q(tid)}, ${q(kind)}, '{}'::jsonb, ${at(d(day))} where exists (select 1 from public.tracked_properties where id = ${q(tid)});`);
    });
  }
  for (const key of DEMO_KEYS.buyerSaved) {
    out(`  insert into public.saved_homes (profile_id, listing_key) values (buyer, ${q(key)}) on conflict do nothing;`);
  }
  out(
    `  insert into public.saved_searches (id, profile_id, name, criteria, frequency) values (${q(id(0x901))}, buyer, '3+ beds in San Carlos under $2.5M (Demo)', ${json({ city: "san-carlos", beds: "3", maxPrice: "2500000" })}, 'off'), (${q(id(0x902))}, buyer, 'Belmont and Redwood City condos (Demo)', ${json({ city: "belmont,redwood-city", type: "condo" })}, 'off');`,
  );
  // A message thread with the agent (marked; no emails: the queued ones are deleted below).
  const thread: [string, string, number][] = [
    ["agent", "Welcome! I've added a few homes I think you'll like to your list. Let me know which ones you'd like to see.", -6],
    ["buyer", "Thanks! The Redwood City one looks great. Is Saturday possible?", -5],
    ["agent", "Saturday at 10 works. I'll confirm with the listing agent and send the details.", -5],
    ["buyer", "Perfect, see you then.", -4],
  ];
  thread.forEach(([from, body, day], i) => {
    out(`  insert into public.messages (member_id, sender_id, body) values (buyer, ${from === "agent" ? "agent" : "buyer"}, ${q(`${DEMO_KEYS.messagePrefix} ${body}`)});`);
    out(`  update public.messages set created_at = ${at(d(day), `1${i}:05`)}, read_at = ${at(d(day), `1${i}:30`)} where id = (select max(id) from public.messages where member_id = buyer);`);
  });
  // Fictional members' threads (for the console's Messages list).
  out(`  insert into public.messages (member_id, sender_id, body) values (${q(personId(1))}, ${q(personId(1))}, 'Can we move Tuesday''s showing to 3pm? (Demo)'), (${q(personId(3))}, agent, 'Escrow confirmed the closing date. Final walkthrough is booked. (Demo)');`);
  const memberTodos: [number, string, number, boolean][] = [
    [1, "Get pre-approval letter updated (Demo)", 3, false],
    [2, "Review the HOA documents for FX-020 (Demo)", 5, false],
    [3, "Schedule a home inspection (Demo)", -1, true],
  ];
  for (const [n, title, due, done] of memberTodos) {
    out(
      `  insert into public.member_todos (id, profile_id, title, detail, source_name, status, decided_by, decided_at, done, done_at, due_date) values (${q(id(0xa00 + n))}, buyer, ${q(title)}, 'Suggested from your documents. (Demo)', 'Demo checklist', 'approved', agent, ${at(d(-3))}, ${done}, ${done ? at(d(-1)) : "null"}, ${q(d(due))});`,
    );
  }
  out(
    `  insert into public.member_drafts (id, profile_id, kind, recipient, about, subject, body) values (${q(id(0xb01))}, buyer, 'message', 'movers', 'Moving quote for early next month (Demo)', 'Moving quote request', 'Hello, we are moving from an apartment to a 3-bedroom home early next month and would like a quote. (Demo)');`,
  );
  // Fictional members' saved homes (so the console's Members page has activity).
  out(`  insert into public.saved_homes (profile_id, listing_key) values (${q(personId(1))}, 'FX-020'), (${q(personId(1))}, 'FX-024'), (${q(personId(2))}, 'FX-002'), (${q(personId(4))}, 'FX-013') on conflict do nothing;`);

  // Public website: placeholder content and pins -------------------------------------------------
  const guide = (city: string, name: string) =>
    `  insert into public.city_guides (city_slug, intro, neighborhoods, school_links, faq, published, is_placeholder) values (${q(city)}, ${q(`Placeholder guide for ${name}. This text is a stand-in until the real guide is written and approved.`)}, ${json([{ name: `${name} Hills (placeholder)`, summary: "Placeholder neighborhood summary." }, { name: `Downtown ${name} (placeholder)`, summary: "Placeholder neighborhood summary." }])}, '[]'::jsonb, ${json([{ q: "Placeholder question?", a: "Placeholder answer." }])}, true, true) on conflict (city_slug) do nothing;`;
  out(guide("belmont", "Belmont"));
  out(guide("redwood-city", "Redwood City"));
  out(
    `  insert into public.posts (slug, kind, title, excerpt, body_md, published, published_at, is_placeholder) values ('demo-market-update', 'market_update', 'Placeholder market update', 'Placeholder excerpt for a monthly market update.', 'Placeholder text. A real market update replaces this before launch.', true, ${at(d(-3))}, true), ('demo-open-house-weekend', 'event', 'Placeholder: open house weekend', 'Placeholder excerpt for an event post.', 'Placeholder text. A real event post replaces this before launch.', true, ${at(d(-1))}, true) on conflict (slug) do nothing;`,
  );
  DEMO_KEYS.featured.forEach((key, i) => {
    out(`  insert into public.featured_listings (listing_key, sort, starts_at, created_by) select ${q(key)}, ${i + 1}, now(), null where exists (select 1 from public.mls_listings where listing_key = ${q(key)}) on conflict (listing_key) do nothing;`);
  });
  out(
    `  insert into public.open_house_signin_links (open_house_key, token, created_by) select open_house_key, ${q(id(0xc01))}::uuid, agent from public.mls_open_houses where listing_key = ${q(DEMO_KEYS.sellerListing)} order by open_house_date desc limit 1 on conflict (open_house_key) do nothing;`,
  );

  // No email: drop everything the triggers queued in this transaction --------------------------------
  out(`  -- Rows made by this transaction's triggers all have created_at = now() (one value per transaction).`);
  out(`  delete from public.notifications where created_at = now();`);
  out(`  delete from public.staff_notifications where created_at = now();`);
  out(`  delete from public.notification_errors where created_at = now();`);

  return [
    `-- FICTIONAL demo content, ${today} (packages/mls/src/jobs/seed-demo.ts). Removes any earlier demo first.`,
    "begin;",
    demoPurgeSql(accts),
    "do $demo_seed$",
    "declare",
    "  agent uuid; buyer uuid; seller uuid; va uuid; col text;",
    "begin",
    ...s,
    "end",
    "$demo_seed$;",
    "commit;",
    "",
  ].join("\n");
}

// CLI ---------------------------------------------------------------------------------------------
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const accounts: DemoAccounts = { agent: arg("agent"), buyer: arg("buyer"), seller: arg("seller"), va: arg("va") };
  if (args.includes("--purge")) process.stdout.write(demoPurgeSql(accounts));
  else if (args.includes("--check")) process.stdout.write(demoCheckSql());
  else process.stdout.write(demoSeedSql({ today: arg("date"), accounts }));
}

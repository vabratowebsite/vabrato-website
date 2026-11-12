import type { InputPart } from "@vabrato/ai";
import { computeCoe, type SupabaseDb } from "@vabrato/lib";
import { loadMissing } from "./documents";
import { firstName } from "./draft-kinds";
import { redactContacts } from "./drafts";

// The person's own work, as the assistant may read it (S6b PR 4): their
// active transactions, open tasks, contingency removals, recent leads and
// member threads waiting for a reply. Every read runs as the signed-in
// person, so RLS decides the scope. Our code picks the records and
// computes the numbers; the model only reads them (SPEC <ai_rules>).
//
// Each record gets a ref the model may cite (D1, T4, C2, L3, M2) and our
// code turns refs back into links, so the model never writes a link.
// Never included: email addresses, phone numbers, prices, escrow numbers,
// message text, document contents (only which checklist items are missing).

export type RefKind = "D" | "T" | "C" | "L" | "M";

export interface WorkItem {
  ref: string;
  kind: RefKind;
  /** One line of facts for the model. */
  line: string;
  href: string;
  /** Whether it belongs in today's briefing. */
  soon: boolean;
}

export interface WorkSnapshot {
  today: string;
  items: WorkItem[];
  stats: string[];
  links: Record<string, string>;
}

export const CAPS = { deals: 50, tasks: 120, leads: 200, threads: 50 } as const;

export interface WorkRows {
  today: string;
  deals: { id: string; address: string; ratification_date: string; days_to_close: number; rent_back_days: number; agent_id: string | null }[];
  tasks: { deal_id: string; title: string; owner: string; due_date: string; done: boolean }[];
  contingencies: { deal_id: string; kind: string; due_date: string | null; removed_at: string | null }[];
  leads: { id: string; kind: string; name: string | null; status: string; created_at: string; first_reply_at: string | null; assigned_to: string | null; tour_status: string | null; listing_key: string | null }[];
  threads: { member_id: string; name: string | null; waiting_since: string; unread: number }[];
  /** Staff names by id, for owners. */
  people: Record<string, string | null>;
  /** Missing checklist documents by deal id (labels), computed by our code (S6b PR 7a). */
  missingDocs?: Record<string, string[]>;
}

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY);
const when = (today: string, date: string) => {
  const n = days(today, date);
  return n === 0 ? "today" : n > 0 ? `in ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} overdue`;
};
const ago = (today: string, date: string) => {
  const n = days(date, today);
  return n <= 0 ? "today" : `${n} day${n === 1 ? "" : "s"} ago`;
};
/** Typed text in a record: one line, no contact details. */
const clean = (s: string, max = 120) => redactContacts(s.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, max);

const CONTINGENCY: Record<string, string> = { financing: "loan", appraisal: "appraisal", insurance: "insurance", property_condition: "property condition" };
const LEAD_KIND: Record<string, string> = { contact: "contact form", valuation: "valuation request", tour: "tour request", transform: "renovation enquiry", newsletter: "newsletter sign-up", open_house_signin: "open-house sign-in" };

/** Builds the snapshot from rows already read under the person's RLS. */
export function buildSnapshot(rows: WorkRows): WorkSnapshot {
  const { today } = rows;
  const items: WorkItem[] = [];
  const owner = (id: string | null) => (id ? (firstName(rows.people[id]) ?? "staff") : "unassigned");

  const deals = rows.deals.slice(0, CAPS.deals);
  const dealRef = new Map<string, string>();
  deals.forEach((d, i) => {
    const ref = `D${i + 1}`;
    dealRef.set(d.id, ref);
    const coe = computeCoe(d.ratification_date, d.days_to_close);
    const toCoe = days(today, coe);
    const missing = rows.missingDocs?.[d.id] ?? [];
    const docs = missing.length ? ` | documents missing: ${missing.length} (${missing.slice(0, 5).join("; ")}${missing.length > 5 ? "; …" : ""})` : "";
    items.push({
      ref,
      kind: "D",
      line: `${ref} | transaction | ${clean(d.address, 160)} | accepted ${d.ratification_date} | closes ${coe} (${when(today, coe)})${d.rent_back_days > 0 ? ` | seller stays ${d.rent_back_days} days after` : ""} | agent: ${owner(d.agent_id)}${docs}`,
      href: missing.length ? `/deals/${d.id}/documents` : `/deals/${d.id}`,
      soon: (toCoe >= 0 && toCoe <= 14) || (missing.length > 0 && toCoe >= 0 && toCoe <= 30),
    });
  });

  rows.tasks
    .filter((t) => !t.done && dealRef.has(t.deal_id))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, CAPS.tasks)
    .forEach((t, i) => {
      const ref = `T${i + 1}`;
      items.push({
        ref,
        kind: "T",
        line: `${ref} | task | ${clean(t.title)} | for ${dealRef.get(t.deal_id)} | who: ${clean(t.owner, 30)} | due ${t.due_date} (${when(today, t.due_date)})`,
        href: `/deals/${t.deal_id}`,
        soon: days(today, t.due_date) <= 7,
      });
    });

  rows.contingencies
    .filter((c) => !c.removed_at && c.due_date && dealRef.has(c.deal_id))
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .forEach((c, i) => {
      const ref = `C${i + 1}`;
      const due = c.due_date as string;
      items.push({
        ref,
        kind: "C",
        line: `${ref} | contingency removal | ${CONTINGENCY[c.kind] ?? clean(c.kind, 30)} | for ${dealRef.get(c.deal_id)} | due ${due} (${when(today, due)})`,
        href: `/deals/${c.deal_id}`,
        soon: days(today, due) <= 14,
      });
    });

  const leads = rows.leads.slice(0, CAPS.leads);
  leads.forEach((l, i) => {
    const ref = `L${i + 1}`;
    const waiting = !l.first_reply_at && l.status !== "closed";
    const tour = l.tour_status ? ` | tour ${l.tour_status}` : "";
    items.push({
      ref,
      kind: "L",
      line: `${ref} | lead | ${firstName(l.name) ?? "no name"} | ${LEAD_KIND[l.kind] ?? l.kind} | status ${l.status} | came in ${l.created_at.slice(0, 10)} (${ago(today, l.created_at)}) | ${l.first_reply_at ? `first reply ${l.first_reply_at.slice(0, 10)}` : "no reply yet"}${tour}${l.listing_key ? ` | listing ${clean(l.listing_key, 30)}` : ""} | owner: ${owner(l.assigned_to)}`,
      href: `/leads/${l.id}`,
      soon: waiting || l.tour_status === "requested",
    });
  });

  rows.threads.slice(0, CAPS.threads).forEach((m, i) => {
    const ref = `M${i + 1}`;
    items.push({
      ref,
      kind: "M",
      line: `${ref} | member message waiting | ${firstName(m.name) ?? "member"} | waiting since ${m.waiting_since.slice(0, 10)} (${ago(today, m.waiting_since)}) | ${m.unread} unread`,
      href: `/messages/${m.member_id}`,
      soon: true,
    });
  });

  const noReply = leads.filter((l) => !l.first_reply_at && l.status !== "closed");
  const replied = leads.filter((l) => l.first_reply_at).map((l) => Date.parse(l.first_reply_at as string) - Date.parse(l.created_at)).sort((a, b) => a - b);
  const median = replied.length ? replied[Math.floor((replied.length - 1) / 2)]! : null;
  const byKind = Object.entries(leads.reduce<Record<string, number>>((acc, l) => ((acc[LEAD_KIND[l.kind] ?? l.kind] = (acc[LEAD_KIND[l.kind] ?? l.kind] ?? 0) + 1), acc), {}))
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  const stats = [
    `Today is ${today}.`,
    `Active transactions: ${deals.length}${rows.deals.length > CAPS.deals ? ` (first ${CAPS.deals} shown of ${rows.deals.length})` : ""}; closing in the next 14 days: ${items.filter((i) => i.kind === "D" && i.soon).length}.`,
    `Open tasks due in the next 30 days or overdue: ${items.filter((i) => i.kind === "T").length}; overdue: ${rows.tasks.filter((t) => !t.done && dealRef.has(t.deal_id) && t.due_date < today).length}.`,
    `Leads in the last 90 days: ${leads.length}${rows.leads.length > CAPS.leads ? ` (first ${CAPS.leads} shown)` : ""}${byKind ? ` (${byKind})` : ""}; with no reply yet: ${noReply.length}; median time to first reply: ${median === null ? "no replies yet" : fmtDuration(median)}.`,
    `Member message threads waiting for a reply: ${rows.threads.length}.`,
    ...(rows.missingDocs ? [`Active transactions with documents missing from their checklist: ${deals.filter((d) => (rows.missingDocs?.[d.id] ?? []).length > 0).length}.`] : []),
  ];
  return { today, items, stats, links: Object.fromEntries(items.map((i) => [i.ref, i.href])) };
}

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

const GROUPS: { kind: RefKind; label: string }[] = [
  { kind: "D", label: "Transactions" },
  { kind: "T", label: "Open tasks" },
  { kind: "C", label: "Contingency removals" },
  { kind: "L", label: "Leads" },
  { kind: "M", label: "Member messages waiting" },
];

/** The snapshot as model input: our numbers as text, the records as data. */
export function snapshotParts(s: WorkSnapshot, scope: "briefing" | "all"): InputPart[] {
  const parts: InputPart[] = [{ type: "text", text: s.stats.join("\n") }];
  for (const g of GROUPS) {
    const lines = s.items.filter((i) => i.kind === g.kind && (scope === "all" || i.soon)).map((i) => i.line);
    parts.push({ type: "data", label: `${g.label} (ref | facts)`, text: lines.length ? lines.join("\n") : "None." });
  }
  return parts;
}

/** Reads the person's work under their own RLS. */
export async function loadWork(supabase: SupabaseDb, today: string): Promise<WorkRows> {
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * DAY).toISOString().slice(0, 10);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * DAY).toISOString();
  const [{ data: deals }, { data: leads }, { data: messages }] = await Promise.all([
    supabase.from("deals").select("id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id").eq("status", "active").order("ratification_date").limit(CAPS.deals + 1),
    supabase.from("leads").select("id, kind, name, status, created_at, first_reply_at, assigned_to, tour_status, listing_key").gte("created_at", since).order("created_at", { ascending: false }).limit(CAPS.leads + 1),
    supabase.from("messages").select("member_id, sender_id, created_at, read_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const ids = (deals ?? []).slice(0, CAPS.deals).map((d) => d.id);
  const [{ data: tasks }, { data: conts }] = ids.length
    ? await Promise.all([
        supabase.from("tasks").select("deal_id, title, owner, due_date, done").in("deal_id", ids).eq("done", false).lte("due_date", horizon).order("due_date").limit(CAPS.tasks),
        supabase.from("deal_contingencies").select("deal_id, kind, due_date, removed_at").in("deal_id", ids).is("removed_at", null),
      ])
    : [{ data: [] }, { data: [] }];

  const waiting = [...waitingThreads(messages ?? []).entries()];
  const personIds = [...new Set([...(deals ?? []).map((d) => d.agent_id), ...(leads ?? []).map((l) => l.assigned_to), ...waiting.map(([id]) => id)].filter((x): x is string => Boolean(x)))];
  const { data: people } = personIds.length ? await supabase.from("profiles").select("id, full_name").in("id", personIds) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const missing = await loadMissing(supabase, (deals ?? []).slice(0, CAPS.deals));

  return {
    today,
    deals: deals ?? [],
    tasks: tasks ?? [],
    contingencies: conts ?? [],
    leads: leads ?? [],
    threads: waiting.map(([member_id, t]) => ({ member_id, name: names[member_id] ?? null, waiting_since: t.since, unread: t.unread })),
    people: names,
    missingDocs: Object.fromEntries(missing.map((m) => [m.id, m.missing])),
  };
}

/**
 * Threads where the member wrote last, from messages newest first: since when
 * they've been waiting (their first message after the last staff reply) and
 * how many of those are unread.
 */
export function waitingThreads(messages: { member_id: string; sender_id: string | null; created_at: string; read_at: string | null }[]) {
  const out = new Map<string, { since: string; unread: number }>();
  const closed = new Set<string>();
  for (const m of messages) {
    if (closed.has(m.member_id)) continue;
    if (m.sender_id !== m.member_id) {
      closed.add(m.member_id);
      continue;
    }
    const t = out.get(m.member_id) ?? { since: m.created_at, unread: 0 };
    t.since = m.created_at;
    if (!m.read_at) t.unread += 1;
    out.set(m.member_id, t);
  }
  return out;
}

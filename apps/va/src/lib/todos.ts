import { fmtShort, type SupabaseDb } from "@vabrato/lib";
import { pacificToday, whenText, type AppointmentFields } from "./appointment-kinds";

// Staff to-dos and appointment lists for the lead, deal and Today pages
// (S6b PR 8). Read as the signed-in person (RLS, 0035). Before 0035 is
// applied the table doesn't exist: callers get ready = false and hide the panel.

export interface TodoView {
  id: string;
  title: string;
  due_date: string | null;
  dueText: string | null;
  overdue: boolean;
  source: string;
  where?: { href: string; label: string };
}

type TodoRowDb = { id: string; title: string; due_date: string | null; source: string; lead_id: string | null; deal_id: string | null; leads?: { name: string | null; email: string } | null; deals?: { address: string } | null };

export function toTodoView(r: TodoRowDb, today: string, withWhere = false): TodoView {
  return {
    id: r.id,
    title: r.title,
    due_date: r.due_date,
    dueText: r.due_date ? fmtShort(r.due_date) : null,
    overdue: Boolean(r.due_date && r.due_date < today),
    source: r.source,
    ...(withWhere
      ? { where: r.lead_id ? { href: `/leads/${r.lead_id}`, label: r.leads?.name || r.leads?.email || "Lead" } : { href: `/deals/${r.deal_id}`, label: r.deals?.address ?? "Transaction" } }
      : {}),
  };
}

const byDue = (a: TodoView, b: TodoView) => (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : (a.due_date ?? "9999") > (b.due_date ?? "9999") ? 1 : a.title.localeCompare(b.title);

/** Open to-dos on one lead or deal, earliest due first, undated last. */
export async function todosFor(supabase: SupabaseDb, where: { lead_id: string } | { deal_id: string }): Promise<{ ready: boolean; todos: TodoView[] }> {
  const [col, value] = "lead_id" in where ? (["lead_id", where.lead_id] as const) : (["deal_id", where.deal_id] as const);
  const { data, error } = await supabase.from("staff_todos").select("id, title, due_date, source, lead_id, deal_id").eq(col, value).eq("done", false).limit(100);
  if (error) return { ready: false, todos: [] };
  const today = pacificToday();
  return { ready: true, todos: (data ?? []).map((r) => toTodoView(r, today)).sort(byDue) };
}

/** Today: open to-dos the caller can work that are overdue or due within 7 days, then undated ones (20 at most). */
export async function todosForToday(supabase: SupabaseDb): Promise<{ ready: boolean; todos: TodoView[] }> {
  const today = pacificToday();
  const week = new Date(`${today}T00:00:00Z`);
  week.setUTCDate(week.getUTCDate() + 7);
  const horizon = week.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("staff_todos")
    .select("id, title, due_date, source, lead_id, deal_id, leads(name, email), deals(address)")
    .eq("done", false)
    .or(`due_date.lte.${horizon},due_date.is.null`)
    .limit(100);
  if (error) return { ready: false, todos: [] };
  return { ready: true, todos: ((data ?? []) as unknown as TodoRowDb[]).map((r) => toTodoView(r, today, true)).sort(byDue).slice(0, 20) };
}

export interface AppointmentListRow {
  id: string;
  title: string;
  when: string;
  status: "draft" | "approved";
  mine: boolean;
}

/** Appointment drafts on one lead or deal the caller can see: their own, and approved ones. */
export async function appointmentsFor(supabase: SupabaseDb, me: string, where: { lead_id: string } | { deal_id: string }): Promise<AppointmentListRow[]> {
  const [col, value] = "lead_id" in where ? (["lead_id", where.lead_id] as const) : (["deal_id", where.deal_id] as const);
  const { data } = await supabase.from("ai_drafts").select("id, status, content, owner_id, updated_at").eq("kind", "appointment").eq(col, value).in("status", ["draft", "approved"]).order("updated_at", { ascending: false }).limit(20);
  return (data ?? []).map((r) => {
    const f = r.content as unknown as AppointmentFields;
    return { id: r.id, title: f?.title || "Appointment", when: f?.date && f.start ? whenText(f.date, f.start) : "Date and time to be set", status: r.status as "draft" | "approved", mine: r.owner_id === me };
  });
}

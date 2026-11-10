import type { ListingPerformance, ListingPerformanceWeek } from "@vabrato/db";
import { buildTimeline, diffDays, fmtShort, type SellerTimeline, type SupabaseDb } from "@vabrato/lib";
import type { TimelineItem } from "@vabrato/ui/web";

// Seller portal data (mockup 06). RLS: a seller reads only deals they're a
// member of, and only that deal's contingencies and tasks. Listing activity
// comes from listing_performance() (counts only; 0021).

export interface SellerDeal {
  id: string;
  address: string;
  ratification_date: string;
  days_to_close: number;
  rent_back_days: number;
  sale_price: number | null;
  status: "active" | "closed" | "cancelled";
  listing_key: string | null;
}

export interface SellerTodo {
  title: string;
  due_date: string;
  done: boolean;
}

/** Active deals first, newest first. */
export async function sellerDeals(supabase: SupabaseDb): Promise<SellerDeal[]> {
  const { data } = await supabase
    .from("deals")
    .select("id, address, ratification_date, days_to_close, rent_back_days, sale_price, status, listing_key")
    .order("created_at", { ascending: false })
    .limit(20);
  const deals = (data ?? []) as SellerDeal[];
  return [...deals.filter((d) => d.status === "active"), ...deals.filter((d) => d.status !== "active")];
}

/** The deal a page shows: ?deal= when it's one of theirs, else the first. */
export function pickDeal(deals: SellerDeal[], requested: string | undefined): SellerDeal | null {
  return deals.find((d) => d.id === requested) ?? deals[0] ?? null;
}

export async function dealTimeline(supabase: SupabaseDb, deal: SellerDeal, today: string): Promise<{ timeline: SellerTimeline; todos: SellerTodo[] }> {
  const [{ data: contingencies }, { data: tasks }] = await Promise.all([
    supabase.from("deal_contingencies").select("kind, due_date, removed_at").eq("deal_id", deal.id),
    supabase.from("tasks").select("title, due_date, done, owner").eq("deal_id", deal.id).eq("owner", "Seller").order("due_date"),
  ]);
  const sellerTasks = tasks ?? [];
  return {
    timeline: buildTimeline(deal, contingencies ?? [], sellerTasks, today),
    todos: sellerTasks.map((t) => ({ title: t.title, due_date: t.due_date, done: t.done })),
  };
}

export async function listingPerformance(supabase: SupabaseDb, dealId: string): Promise<ListingPerformance | null> {
  const { data, error } = await supabase.rpc("listing_performance", { p_deal: dealId });
  if (error || !data) return null;
  return data as unknown as ListingPerformance;
}

/** Timeline rows for the portal Timeline component (done / next / upcoming). */
export function timelineItems(t: SellerTimeline): TimelineItem[] {
  return t.milestones.map((m, i) => ({
    title: m.label,
    date: fmtShort(m.date),
    state: m.complete ? "done" : i === t.nextIndex ? "next" : "upcoming",
  }));
}

/** Page heading: "14 days to closing", "Closing today", "Closed". */
export function closingHeadline(deal: Pick<SellerDeal, "status">, coe: string, today: string): string {
  if (deal.status === "closed") return "Closed";
  if (deal.status === "cancelled") return "Sale cancelled";
  const days = diffDays(today, coe);
  if (days > 1) return `${days} days to closing`;
  if (days === 1) return "1 day to closing";
  if (days === 0) return "Closing today";
  return "Closing in progress";
}

export const STATUS_PILL: Record<SellerDeal["status"], { label: string; tone: "green" | "navy" | "outline" }> = {
  active: { label: "In escrow", tone: "green" },
  closed: { label: "Closed", tone: "navy" },
  cancelled: { label: "Cancelled", tone: "outline" },
};

const weekLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** "Oct 6" (week starting) labels and bar heights (0–100) for the weekly activity chart. */
export function activityBars(weeks: ListingPerformanceWeek[], metric: "views" | "saves" | "tour_requests" | "open_house_signins" = "views") {
  const max = Math.max(0, ...weeks.map((w) => w[metric]));
  return weeks.map((w) => ({
    label: weekLabel(w.week_start),
    value: w[metric],
    pct: max === 0 ? 0 : Math.round((w[metric] / max) * 100),
  }));
}

export const fmtCount = (n: number) => n.toLocaleString("en-US");

/** Today's date in California (yyyy-mm-dd); servers run on UTC. */
export function pacificToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

import { saleTimelineIcs } from "@/lib/ics";
import { NO_STORE, apiMember, unauthorized } from "@/member/api";
import { dealTimeline, pacificToday, pickDeal, sellerDeals } from "@/member/seller";

// "Add to calendar" on /my/seller: the sale timeline as an .ics download.
// RLS: only deals the member is on (an unknown ?deal= falls back to theirs).
export async function GET(req: Request) {
  const member = await apiMember();
  if (!member) return unauthorized();
  const requested = new URL(req.url).searchParams.get("deal") ?? undefined;
  const deal = pickDeal(await sellerDeals(member.supabase), requested);
  if (!deal) return new Response("Not found", { status: 404, headers: NO_STORE });
  const { timeline } = await dealTimeline(member.supabase, deal, pacificToday());
  const origin = new URL(req.url).origin;
  const body = saleTimelineIcs({ dealId: deal.id, address: deal.address, milestones: timeline.milestones, url: `${origin}/my/seller` });
  return new Response(body, {
    headers: { ...NO_STORE, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="vabrato-sale-timeline.ics"' },
  });
}

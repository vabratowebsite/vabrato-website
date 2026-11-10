import { flagEnabled } from "@/lib/public/listings";
import { apiMember, json, logDbError, unauthorized } from "@/member/api";
import { LISTING_KEY } from "@/member/saved";

// Price & sale history for the listing page island (MLS-6). 404 while
// vow_enabled is off (review item 1); 401 signed out; 403 until the member
// accepts the VOW terms. The DB functions check has_vow_access() again.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { key } = await params;
  if (!LISTING_KEY.test(key) || !(await flagEnabled("vow_enabled"))) return json({ error: "unavailable" }, 404);
  const m = await apiMember();
  if (!m) return unauthorized();
  if (!m.profile.vow_accepted_at) return json({ error: "terms" }, 403);

  const [history, sold] = await Promise.all([
    m.supabase.rpc("listing_price_history", { p_key: key }),
    m.supabase.rpc("listing_sold_detail", { p_key: key }),
  ]);
  if (history.error || sold.error) {
    logDbError("listing history GET", history.error ?? sold.error);
    return json({ error: "failed" }, 500);
  }
  return json({
    events: (history.data ?? []).map((e) => ({ at: e.observed_at, price: e.list_price === null ? null : Number(e.list_price), status: e.standard_status })),
    sold: sold.data?.[0] ? { price: Number(sold.data[0].close_price), date: sold.data[0].close_date } : null,
  });
}

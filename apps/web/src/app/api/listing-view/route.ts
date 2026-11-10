import { clientIp } from "@/lib/leads";
import { LISTING_KEY_RE, isBotRequest, visitorHash } from "@/lib/listing-views";
import { publicWriteSupabase } from "@/lib/public/supabase";
import { sameOrigin } from "@/member/api";

const DONE = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

// Beacon from vabrato.com listing pages (ListingViewBeacon). Always answers
// 204, so the response says nothing about what was counted. Off until
// LISTING_VIEW_SECRET is set (and its hash is in listing_view_keys).
export async function POST(req: Request) {
  const secret = process.env.LISTING_VIEW_SECRET;
  if (!secret || !sameOrigin(req) || isBotRequest(req.headers)) return DONE();
  const ip = clientIp(req.headers);
  let key: unknown;
  try {
    key = ((await req.json()) as { key?: unknown }).key;
  } catch {
    return DONE();
  }
  if (!ip || typeof key !== "string" || !LISTING_KEY_RE.test(key)) return DONE();
  const { error } = await publicWriteSupabase().rpc("record_listing_view", { p_listing_key: key, p_visitor: visitorHash(ip, secret), p_key: secret });
  if (error) console.error("listing view", { code: error.code ?? "unknown" });
  return DONE();
}

import { apiMember, forbiddenOrigin, json, logDbError, sameOrigin, unauthorized } from "@/member/api";
import { LISTING_KEY } from "@/member/saved";

// The signed-in member's saved homes (listing keys only; review item 5).
export const dynamic = "force-dynamic";

export async function GET() {
  const m = await apiMember();
  if (!m) return unauthorized();
  const { data, error } = await m.supabase.from("saved_homes").select("listing_key").eq("profile_id", m.profile.id).order("created_at", { ascending: false });
  if (error) {
    logDbError("saved-homes GET", error);
    return json({ error: "failed" }, 500);
  }
  return json({ keys: (data ?? []).map((r) => r.listing_key) });
}

async function keyFrom(req: Request): Promise<string | null> {
  try {
    const body = (await req.json()) as { listingKey?: unknown };
    return typeof body.listingKey === "string" && LISTING_KEY.test(body.listingKey) ? body.listingKey : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const m = await apiMember();
  if (!m) return unauthorized();
  const key = await keyFrom(req);
  if (!key) return json({ error: "bad_request" }, 400);
  const { error } = await m.supabase.from("saved_homes").insert({ listing_key: key });
  if (error && error.code !== "23505") {
    logDbError("saved-homes POST", error);
    return json({ error: /saved_homes_limit/.test(error.message) ? "limit" : "failed" }, /saved_homes_limit/.test(error.message) ? 409 : 500);
  }
  return json({ saved: true, listingKey: key }, 201);
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const m = await apiMember();
  if (!m) return unauthorized();
  const key = await keyFrom(req);
  if (!key) return json({ error: "bad_request" }, 400);
  const { error } = await m.supabase.from("saved_homes").delete().eq("profile_id", m.profile.id).eq("listing_key", key);
  if (error) {
    logDbError("saved-homes DELETE", error);
    return json({ error: "failed" }, 500);
  }
  return json({ saved: false, listingKey: key });
}

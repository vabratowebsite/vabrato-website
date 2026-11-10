import { listCities } from "@/lib/public/listings";
import { parseSearchParams } from "@/lib/search-params";
import { apiMember, forbiddenOrigin, json, logDbError, sameOrigin, unauthorized } from "@/member/api";
import { criteriaFromFilters, describeSearch } from "@/member/saved";

// "Save search" from /search: the client sends the page's query string; the
// server parses it with the same schema as the search page (FH-1), so only
// known filters are stored.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const m = await apiMember();
  if (!m) return unauthorized();
  let query = "";
  try {
    const body = (await req.json()) as { query?: unknown };
    query = typeof body.query === "string" ? body.query.slice(0, 2000) : "";
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const filters = parseSearchParams(new URLSearchParams(query.replace(/^\?/, "")));
  const cities = await listCities();
  const name = describeSearch(filters, (slug) => cities.find((c) => c.slug === slug)?.name);
  const { data, error } = await m.supabase
    .from("saved_searches")
    .insert({ name, criteria: criteriaFromFilters(filters), frequency: "instant" })
    .select("id, name")
    .single();
  if (error) {
    logDbError("saved-searches POST", error);
    const limit = /saved_searches_limit/.test(error.message);
    return json({ error: limit ? "limit" : "failed" }, limit ? 409 : 500);
  }
  return json({ id: data.id, name: data.name }, 201);
}

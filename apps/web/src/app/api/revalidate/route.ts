import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { CONTENT_CACHE_TAG, MLS_CACHE_TAG } from "@/lib/public/supabase";

// On-demand revalidation (review item 6): the MLS sync job (Render) calls this
// after a successful run so removed or changed listings drop out of the cache
// right away instead of within the 15-minute window. S6's content editor
// uses the content tag. Requires REVALIDATE_SECRET.

const TAGS = new Set([MLS_CACHE_TAG, CONTENT_CACHE_TAG]);

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  const given = req.headers.get("x-revalidate-secret") ?? "";
  if (!sameSecret(given, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const tag = new URL(req.url).searchParams.get("tag") ?? MLS_CACHE_TAG;
  if (!TAGS.has(tag)) return Response.json({ error: "unknown tag" }, { status: 400 });
  revalidateTag(tag);
  return Response.json({ revalidated: tag });
}

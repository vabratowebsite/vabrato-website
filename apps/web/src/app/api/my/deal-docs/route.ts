import { NextResponse } from "next/server";
import { apiMember, json, NO_STORE, unauthorized } from "@/member/api";
import { DEAL_DOC_PATH } from "@/member/documents";

// Download of a document the transaction desk shared on the member's deal
// (deal-docs bucket; storage RLS: deal access). 60-second signed URL, forced
// download (review item 8).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!DEAL_DOC_PATH.test(path)) return json({ error: "not_found" }, 404);
  const m = await apiMember();
  if (!m) return unauthorized();
  const name = path.split("/").pop() ?? "document";
  const { data, error } = await m.supabase.storage.from("deal-docs").createSignedUrl(path, 60, { download: name });
  if (error || !data) return json({ error: "not_found" }, 404);
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: NO_STORE });
}

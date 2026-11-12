import { NextResponse } from "next/server";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { parseDocPath } from "@/lib/documents";
import { supabaseServer } from "@/lib/supabase-server";

// Opens one of a deal's files for staff (S6b PR 7a): a deal document, one of
// the seller's own uploads, or a receipt. A 60-second signed URL, made as the
// signed-in person, so storage RLS decides (0009 / 0019 / 0032).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const notFound = () => new NextResponse("Not found", { status: 404, headers: NO_STORE });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const bucket = url.searchParams.get("b") ?? "";
  const path = url.searchParams.get("p") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id) || path.length > 400) return notFound();

  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) return notFound();

  let name: string;
  if (bucket === "deal-docs") {
    const where = parseDocPath(path, id);
    if (!where) return notFound();
    name = where.name;
  } else if (bucket === "receipts") {
    if (!path.startsWith(`deal/${id}/`) || path.includes("..")) return notFound();
    const { data } = await supabase.from("receipts").select("id").eq("deal_id", id).eq("storage_path", path).maybeSingle();
    if (!data) return notFound();
    name = path.split("/").pop() ?? "receipt";
  } else if (bucket === "member-docs") {
    // Only an upload of a seller on this deal.
    const { data: doc } = await supabase.from("member_documents").select("profile_id, name").eq("storage_path", path).maybeSingle();
    if (!doc) return notFound();
    const { data: seller } = await supabase.from("deal_members").select("profile_id").eq("deal_id", id).eq("profile_id", doc.profile_id).eq("member_role", "seller").maybeSingle();
    if (!seller) return notFound();
    name = doc.name;
  } else {
    return notFound();
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60, { download: name });
  if (error || !data) return notFound();
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: NO_STORE });
}

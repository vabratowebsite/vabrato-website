import { NextResponse } from "next/server";
import { z } from "zod";
import { apiMember, forbiddenOrigin, json, logDbError, NO_STORE, sameOrigin, unauthorized } from "@/member/api";

// Download (GET): a 60-second signed URL that forces a download
// (Content-Disposition: attachment, review item 8). Delete (DELETE): the
// uploader removes the listing and the file.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return json({ error: "not_found" }, 404);
  const m = await apiMember();
  if (!m) return unauthorized();
  const { data: doc } = await m.supabase.from("member_documents").select("name, storage_path").eq("id", id.data).maybeSingle();
  if (!doc) return json({ error: "not_found" }, 404);
  const { data, error } = await m.supabase.storage.from("member-docs").createSignedUrl(doc.storage_path, 60, { download: doc.name });
  if (error || !data) {
    logDbError("documents download", { message: error?.message });
    return json({ error: "failed" }, 500);
  }
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: NO_STORE });
}

export async function DELETE(req: Request, { params }: Params) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return json({ error: "not_found" }, 404);
  const m = await apiMember();
  if (!m) return unauthorized();
  const { data: deleted, error } = await m.supabase.from("member_documents").delete().eq("id", id.data).select("storage_path");
  if (error) {
    logDbError("documents delete", error);
    return json({ error: "failed" }, 500);
  }
  if (!deleted?.length) return json({ error: "not_found" }, 404);
  await m.supabase.storage.from("member-docs").remove(deleted.map((d) => d.storage_path));
  return json({ deleted: true });
}

import { apiMember, forbiddenOrigin, json, logDbError, sameOrigin, unauthorized } from "@/member/api";
import { displayName, MAX_DOCUMENT_BYTES, MEMBER_PATH, sniffDocumentType } from "@/member/documents";

// Step 2 of an upload: read the uploaded file back, check its type from its
// bytes (review item 8: no SVG, nothing that isn't PDF or a photo) and its
// size, then list it. Anything else is deleted from storage.
export const dynamic = "force-dynamic";

const EXT_TYPE: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", webp: "image/webp", heic: "image/heic" };

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const m = await apiMember();
  if (!m) return unauthorized();
  let body: { path?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const path = typeof body.path === "string" ? body.path : "";
  if (!MEMBER_PATH.test(path) || !path.startsWith(`member/${m.profile.id}/`)) return json({ error: "bad_request" }, 400);

  const bucket = m.supabase.storage.from("member-docs");
  const { data: file, error } = await bucket.download(path);
  if (error || !file) return json({ error: "not_found" }, 404);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffDocumentType(bytes);
  const declared = EXT_TYPE[path.split(".").pop() ?? ""];
  if (!type || type !== declared || bytes.length > MAX_DOCUMENT_BYTES) {
    await bucket.remove([path]);
    return json({ error: !type || type !== declared ? "type" : "too_large" }, !type || type !== declared ? 415 : 413);
  }

  const { data: row, error: insertError } = await m.supabase
    .from("member_documents")
    .insert({
      profile_id: m.profile.id,
      name: displayName(typeof body.name === "string" ? body.name : "Document"),
      storage_path: path,
      size_bytes: bytes.length,
      content_type: type,
      uploaded_by: m.profile.id,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    logDbError("documents complete", insertError);
    await bucket.remove([path]);
    return json({ error: "failed" }, 500);
  }
  return json({ id: row.id }, 201);
}

import { randomUUID } from "node:crypto";
import { apiMember, forbiddenOrigin, json, logDbError, sameOrigin, unauthorized } from "@/member/api";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, storagePath, type DocumentType } from "@/member/documents";

// Step 1 of an upload: a short-lived signed upload URL into the member's own
// folder (storage RLS checks it). The browser uploads straight to storage,
// then calls /complete, which checks the actual bytes before the document
// is listed (review item 8).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const m = await apiMember();
  if (!m) return unauthorized();
  let body: { name?: unknown; size?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const size = typeof body.size === "number" ? body.size : 0;
  const type = typeof body.type === "string" ? body.type : "";
  if (size < 1 || size > MAX_DOCUMENT_BYTES) return json({ error: "too_large" }, 413);
  if (!(DOCUMENT_TYPES as readonly string[]).includes(type)) return json({ error: "type" }, 415);
  const path = storagePath(m.profile.id, typeof body.name === "string" ? body.name : "document", type as DocumentType, randomUUID());
  const { data, error } = await m.supabase.storage.from("member-docs").createSignedUploadUrl(path);
  if (error || !data) {
    logDbError("documents upload-url", { message: error?.message });
    return json({ error: "failed" }, 500);
  }
  return json({ path: data.path, token: data.token });
}

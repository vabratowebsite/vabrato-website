import type { Member } from "./session";

// The documents a member can open (S5 PR 4, shared in S5b PR 2): their
// member-docs rows (their own uploads and files their Vabrato team added for
// them), and for sellers the top-level files the transaction desk shared on
// each active deal. Everything is read with the member's own client, so RLS
// and the storage policies decide what's listed.

export interface MemberUpload {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface DealFiles {
  deal: { id: string; address: string };
  files: { name: string; path: string }[];
}

export async function listMemberDocuments(member: Pick<Member, "supabase">): Promise<{ uploads: MemberUpload[]; deals: DealFiles[] }> {
  const { supabase } = member;
  const [{ data: docs }, { data: deals }] = await Promise.all([
    supabase.from("member_documents").select("id, name, size_bytes, content_type, uploaded_by, created_at").order("created_at", { ascending: false }),
    supabase.from("deals").select("id, address").eq("status", "active"),
  ]);
  const dealFiles = await Promise.all(
    (deals ?? []).map(async (d) => {
      const { data } = await supabase.storage.from("deal-docs").list(`deal/${d.id}`, { limit: 100, sortBy: { column: "name", order: "asc" } });
      // Folder entries (no id), such as the staff-only folder, are never listed.
      const files = (data ?? []).filter((f) => f.id && f.name && !f.name.startsWith(".")).map((f) => ({ name: f.name, path: `deal/${d.id}/${f.name}` }));
      return { deal: d, files };
    }),
  );
  return { uploads: docs ?? [], deals: dealFiles };
}

/** How a document is named in a link or a form value: "upload:<id>" or "deal:<path>". */
export const docRef = {
  upload: (id: string) => `upload:${id}`,
  deal: (path: string) => `deal:${path}`,
};

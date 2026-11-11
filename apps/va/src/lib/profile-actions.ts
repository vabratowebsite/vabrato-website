"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STAFF_ROLES, fairHousingIssuesIn, getProfile } from "@vabrato/lib";
import type { ActionState } from "@/lib/lead-actions";
import { checkPhoto } from "@/lib/image-type";
import { revalidateNote, revalidateWebsite } from "@/lib/revalidate-web";
import { supabaseServer } from "@/lib/supabase-server";

// Own agent profile (S6 PR 4). Agents edit their own row directly, no
// approval (SPEC <approvals>); RLS and the 0014/0024 guard limit them to
// their own row, their own photo folder, and content fields only.

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

const opt = (max: number) => z.string().trim().max(max).transform((s) => s || null);

const ProfileForm = z.object({
  title: z.string().trim().max(80),
  bio: z.string().trim().max(4000),
  outlook: z.string().trim().max(2000),
  history: z.string().trim().max(4000),
  phone: opt(30).refine((s) => s === null || /^[0-9+().\-\s]{7,30}$/.test(s), "Enter a phone number with digits, spaces, dashes or brackets."),
  email: opt(120).refine((s) => s === null || z.string().email().safeParse(s).success, "Enter a business email address."),
  start_year: z
    .string()
    .trim()
    .transform((s) => (s ? Number(s) : null))
    .refine((n) => n === null || (Number.isInteger(n) && n >= 1950 && n <= 2100), "Enter a year like 2012."),
  video_youtube_id: opt(11).refine((s) => s === null || /^[A-Za-z0-9_-]{11}$/.test(s), "A YouTube video ID is 11 characters, e.g. dQw4w9WgXcQ."),
});

export async function saveProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staffClient();
  const parsed = ProfileForm.safeParse(Object.fromEntries(["title", "bio", "outlook", "history", "phone", "email", "start_year", "video_youtube_id"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const issues = fairHousingIssuesIn({ title: parsed.data.title, bio: parsed.data.bio, outlook: parsed.data.outlook, history: parsed.data.history });
  const block = [...new Set(issues.filter((i) => i.level === "block").map((i) => `"${i.match}"`))];
  if (block.length) return { error: `Reword before saving: ${block.join(", ")} (Fair Housing, FH-1).` };
  const { data, error } = await supabase
    .from("agent_profiles")
    .update({ ...parsed.data, is_placeholder: false })
    .eq("profile_id", profile.id)
    .select("slug");
  if (error) return { error: "Couldn't save your profile." };
  if (!data?.length) return { error: "Your login isn't linked to a profile yet. Ask Mark to link it." };
  const site = await revalidateWebsite();
  revalidatePath("/profile");
  return { error: null, ok: `Saved. ${revalidateNote(site)}` };
}

export async function uploadPhotoAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staffClient();
  const file = form.get("photo");
  if (!(file instanceof File)) return { error: "Choose a photo to upload." };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = checkPhoto(file.size, head);
  if (!check.ok) return { error: check.error };

  const { data: row } = await supabase.from("agent_profiles").select("slug, photo_path").eq("profile_id", profile.id).maybeSingle();
  if (!row) return { error: "Your login isn't linked to a profile yet. Ask Mark to link it." };

  const path = `${profile.id}/photo-${Date.now()}.${check.type.ext}`;
  const { error: upErr } = await supabase.storage.from("agent-photos").upload(path, await file.arrayBuffer(), { contentType: check.type.mime, upsert: false, cacheControl: "31536000" });
  if (upErr) return { error: "Couldn't upload the photo. Try again." };
  const { error } = await supabase.from("agent_profiles").update({ photo_path: path }).eq("profile_id", profile.id);
  if (error) {
    await supabase.storage.from("agent-photos").remove([path]);
    return { error: "Couldn't save the photo." };
  }
  if (row.photo_path && row.photo_path.startsWith(`${profile.id}/`)) await supabase.storage.from("agent-photos").remove([row.photo_path]);
  const site = await revalidateWebsite();
  revalidatePath("/profile");
  return { error: null, ok: `Photo updated. ${revalidateNote(site)}` };
}

export async function removePhotoAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staffClient();
  const { data: row } = await supabase.from("agent_profiles").select("photo_path").eq("profile_id", profile.id).maybeSingle();
  if (!row?.photo_path) return { error: null, ok: "No photo to remove." };
  await supabase.from("agent_profiles").update({ photo_path: null }).eq("profile_id", profile.id);
  if (row.photo_path.startsWith(`${profile.id}/`)) await supabase.storage.from("agent-photos").remove([row.photo_path]);
  const site = await revalidateWebsite();
  revalidatePath("/profile");
  // The Remove button goes away with the photo, so the page says it.
  redirect(`/profile?done=photo_removed&site=${site === "done" ? "now" : "later"}`);
}

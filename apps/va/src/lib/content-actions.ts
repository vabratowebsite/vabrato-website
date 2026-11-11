"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ContentTable } from "@vabrato/db";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { asBody, blockingMessage, checkContent, parseContentForm } from "@/lib/content";
import type { ActionState } from "@/lib/lead-actions";
import { revalidateWebsite } from "@/lib/revalidate-web";
import { supabaseServer } from "@/lib/supabase-server";

// Content editor actions (S6 PR 4). Every change goes through the 0024
// database functions: anyone on staff drafts and submits; only the acting
// lead admin publishes, sends back or takes down. The Fair Housing check runs
// on submit and again on publish.

const Id = z.string().uuid();
const Table = z.enum(["city_guides", "posts", "testimonials"]);

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

function friendly(message: string): string {
  if (/lead_admin_only/.test(message)) return "Only Mark (or Viv while Mark is away) can publish, send back or take down content.";
  if (/not_allowed/.test(message)) return "Only the author (or Mark) can change this draft.";
  if (/not_editable/.test(message)) return "This revision has already been sent for approval or published.";
  if (/not_submitted/.test(message)) return "This revision isn't waiting for approval.";
  if (/testimonial_needs_source_and_permission/.test(message)) return "A testimonial needs its source and the client's permission before it's published.";
  if (/invalid_city_slug/.test(message)) return "Pick a city in our service area.";
  if (/invalid_/.test(message)) return "Some fields aren't filled in correctly.";
  if (/duplicate key/.test(message)) return "That web address is already used.";
  return "Something went wrong. Please try again.";
}

const refresh = (id?: string) => {
  revalidatePath("/content");
  if (id) revalidatePath(`/content/${id}`);
  revalidatePath("/");
};

/** Save a new draft (revisionId null) or update a draft or sent-back revision. */
export async function saveDraftAction(table: ContentTable, revisionId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const t = Table.parse(table);
  const parsed = parseContentForm(t, form);
  if (!parsed.ok) return { error: parsed.error };
  const { data, error } = await supabase.rpc("save_content_draft", {
    p_revision: (revisionId ? Id.parse(revisionId) : null) as string,
    p_table: t,
    p_key: parsed.key as string,
    p_body: parsed.body as never,
  });
  if (error || !data) return { error: friendly(error?.message ?? "") };
  refresh(data);
  redirect(`/content/${data}?saved=1`);
}

async function loadRevision(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string) {
  const { data } = await supabase.from("content_revisions").select("id, table_name, row_key, body, status").eq("id", id).maybeSingle();
  return data;
}

export async function submitContentAction(revisionId: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const id = Id.parse(revisionId);
  const rev = await loadRevision(supabase, id);
  if (!rev) return { error: "Unknown revision." };
  const check = checkContent(asBody(rev.body));
  if (check.blocking) return { error: blockingMessage(check) };
  const { error } = await supabase.rpc("submit_content", { p_revision: id });
  if (error) return { error: friendly(error.message) };
  refresh(id);
  // The form goes away once the status changes, so the page says it.
  redirect(`/content/${id}?done=sent`);
}

export async function publishContentAction(revisionId: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const id = Id.parse(revisionId);
  const rev = await loadRevision(supabase, id);
  if (!rev) return { error: "Unknown revision." };
  const check = checkContent(asBody(rev.body));
  if (check.blocking) return { error: `${blockingMessage(check)} Send it back with a note instead.` };
  const { error } = await supabase.rpc("publish_content", { p_revision: id });
  if (error) return { error: friendly(error.message) };
  const site = await revalidateWebsite();
  refresh(id);
  redirect(`/content/${id}?done=published&site=${site === "done" ? "now" : "later"}`);
}

export async function rejectContentAction(revisionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const note = z.string().trim().min(1).max(1000).safeParse(form.get("note"));
  if (!note.success) return { error: "Say what needs to change (up to 1,000 characters)." };
  const id = Id.parse(revisionId);
  const { error } = await supabase.rpc("reject_content", { p_revision: id, p_note: note.data });
  if (error) return { error: friendly(error.message) };
  refresh(id);
  redirect(`/content/${id}?done=rejected`);
}

export async function unpublishContentAction(revisionId: string, table: ContentTable, key: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const { error } = await supabase.rpc("unpublish_content", { p_table: Table.parse(table), p_key: z.string().min(1).max(120).parse(key) });
  if (error) return { error: friendly(error.message) };
  const site = await revalidateWebsite();
  refresh(revisionId);
  redirect(`/content/${Id.parse(revisionId)}?done=unpublished&site=${site === "done" ? "now" : "later"}`);
}

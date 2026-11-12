"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAi } from "@vabrato/ai";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { prepareNote } from "@/lib/drafts";
import { KIND_TITLE, cleanParts, partsText, type KitKind, type Parts } from "@/lib/kit-parts";
import { LISTING_KIT, PRESENTATIONS, kitInput, kitToParts, partsProblems, presentationInput, presentationToParts } from "@/lib/kits";
import { writeupProblems } from "@/lib/market-cma";
import { supabaseServer } from "@/lib/supabase-server";

// S6b PR 5: launch kits and presentations. The model writes; the agent who
// asked edits, approves, then copies or prints. Every read and write runs as
// that person (RLS, 0030: kits only for our own listings, each person's own).

export interface KitView {
  id: string;
  kind: KitKind;
  status: "draft" | "approved" | "discarded";
  parts: Parts;
  sent_via: string | null;
}
export type KitResult = { ok: true; view: KitView; message?: string } | { ok: false; error: string; view?: KitView };

const COLS = "id, kind, status, content, sent_via";
const NO_KEY = "The assistant isn't set up yet: it has no API key. Ask an admin.";

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

const toView = (r: { id: string; kind: string; status: string; content: unknown; sent_via: string | null }): KitView => ({
  id: r.id,
  kind: r.kind as KitKind,
  status: r.status as KitView["status"],
  parts: cleanParts(r.kind as KitKind, r.content),
  sent_via: r.sent_via,
});

export async function writeKitAction(listingKey: string, note: string): Promise<KitResult> {
  if (typeof listingKey !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(listingKey)) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const prepared = prepareNote(note);
  if (prepared.error) return { ok: false, error: prepared.error };
  try {
    const { supabase, profile } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const { data: listing } = await supabase.from("mls_listings").select("listing_key, is_own_listing, data, address_display").eq("listing_key", listingKey).maybeSingle();
    if (!listing?.is_own_listing) return { ok: false, error: "Launch kits are for Vabrato's own listings." };
    const result = await runAi(aiDeps(supabase), LISTING_KIT, { instruction: prepared.note, parts: kitInput(listing.data as Record<string, unknown>, profile.full_name) });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    const parts = kitToParts(result.data);
    const { data: saved, error } = await supabase
      .from("ai_drafts")
      .insert({ kind: "listing_kit", listing_key: listingKey, subject: `Launch kit: ${parts.headline || listingKey}`.slice(0, 200), body: partsText("listing_kit", parts), content: parts })
      .select(COLS)
      .single();
    if (error || !saved) return { ok: false, error: "Couldn't save the kit. Please try again." };
    revalidatePath("/assistant");
    return { ok: true, view: toView(saved), message: "Kit ready. Check every part, edit it, then approve it." };
  } catch (e) {
    console.error("[writeKit]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong writing the kit. Please try again." };
  }
}

const PresentationForm = z.object({
  kind: z.enum(["listing_presentation", "buyer_presentation"]),
  cmaId: z.string().uuid().optional().or(z.literal("")),
  client: z.string().max(80).optional(),
  place: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

/** Writes a presentation and returns its id (the page then opens it). */
export async function writePresentationAction(raw: z.input<typeof PresentationForm>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const f = PresentationForm.safeParse(raw);
  if (!f.success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const prepared = prepareNote(f.data.note);
  if (prepared.error) return { ok: false, error: prepared.error };
  try {
    const { supabase, profile } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const { data: agent } = await supabase.from("agent_profiles").select("display_name, title, bio").eq("profile_id", profile.id).maybeSingle();
    const parts = presentationInput({
      kind: f.data.kind,
      clientFirstName: f.data.client?.trim() || null,
      place: f.data.place?.trim() || null,
      agent: { name: agent?.display_name ?? profile.full_name, title: agent?.title ?? null, bio: agent?.bio ?? null },
    });
    const result = await runAi(aiDeps(supabase), PRESENTATIONS[f.data.kind], { instruction: prepared.note, parts });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    const content = presentationToParts(f.data.kind, result.data);
    // An attached CMA (listing presentations only): one of the person's own, with an approved summary.
    let cmaId: string | undefined;
    if (f.data.kind === "listing_presentation" && f.data.cmaId) {
      const { data: w } = await supabase.from("ai_drafts").select("id").eq("kind", "cma_writeup").eq("cma_id", f.data.cmaId).eq("owner_id", profile.id).eq("status", "approved").limit(1);
      if (!w?.length) return { ok: false, error: "That CMA has no approved summary yet. Approve one on the CMA's page first." };
      cmaId = f.data.cmaId;
    }
    const { data: saved, error } = await supabase
      .from("ai_drafts")
      .insert({ kind: f.data.kind, subject: (content.title || KIND_TITLE[f.data.kind]).slice(0, 200), body: partsText(f.data.kind, content), content: { ...content, ...(cmaId ? { cma_id: cmaId } : {}) } })
      .select("id")
      .single();
    if (error || !saved) return { ok: false, error: "Couldn't save the presentation. Please try again." };
    revalidatePath("/presentations");
    return { ok: true, id: saved.id };
  } catch (e) {
    console.error("[writePresentation]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong writing the presentation. Please try again." };
  }
}

const Id = z.string().uuid();

const KINDS = ["listing_kit", "listing_presentation", "buyer_presentation", "market_update", "cma_writeup"] as const;

/** The facts a market update or CMA write-up was written from (kept beside the parts, for the numbers check). */
const factsOf = (content: unknown): unknown => (content && typeof content === "object" ? (content as Record<string, unknown>).facts : undefined);
/** A listing presentation's attached CMA (S6b PR 6), kept beside the parts. */
const cmaOf = (content: unknown): string | undefined => {
  const v = content && typeof content === "object" ? (content as Record<string, unknown>).cma_id : undefined;
  return typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : undefined;
};

async function loadKitRaw(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string) {
  const { data } = await supabase.from("ai_drafts").select(COLS).eq("id", id).in("kind", [...KINDS]).maybeSingle();
  return data ? { view: toView(data), facts: factsOf(data.content), cmaId: cmaOf(data.content) } : null;
}
async function loadKit(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string) {
  return (await loadKitRaw(supabase, id))?.view ?? null;
}

const subjectFor = (kind: KitKind, parts: Parts) =>
  (kind === "listing_kit" ? `Launch kit: ${parts.headline}` : kind === "cma_writeup" ? "CMA summary" : parts.title || KIND_TITLE[kind]).slice(0, 200);

export async function saveKitAction(id: string, raw: Parts): Promise<KitResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const loaded = await loadKitRaw(supabase, id);
  if (!loaded) return { ok: false, error: "That isn't yours." };
  const current = loaded.view;
  if (current.status !== "draft") return { ok: false, error: current.status === "approved" ? "It's already approved and can't be changed. Write a new one." : "It was discarded.", view: current };
  const parts = cleanParts(current.kind, raw);
  const content = { ...parts, ...(loaded.facts === undefined ? {} : { facts: loaded.facts }), ...(loaded.cmaId ? { cma_id: loaded.cmaId } : {}) };
  const { data, error } = await supabase
    .from("ai_drafts")
    .update({ content: content as never, body: partsText(current.kind, parts), subject: subjectFor(current.kind, parts) })
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't save your changes. Please try again.", view: current };
  return { ok: true, view: toView(data), message: "Saved." };
}

/** Approves it as it now reads; every part goes through the same checks as the model's answer. */
export async function approveKitAction(id: string, raw: Parts): Promise<KitResult> {
  const saved = await saveKitAction(id, raw);
  if (!saved.ok) return saved;
  const kind = saved.view.kind;
  let problems: string[];
  if (kind === "market_update" || kind === "cma_writeup") {
    const { supabase } = await staffClient();
    problems = writeupProblems(kind, saved.view.parts, (await loadKitRaw(supabase, id))?.facts ?? {});
  } else problems = partsProblems(kind, saved.view.parts);
  if (problems.length) return { ok: false, error: `Not approved yet. ${problems.join(" ")}`, view: saved.view };
  const { supabase } = await staffClient();
  const { data, error } = await supabase.from("ai_drafts").update({ status: "approved" }).eq("id", id).eq("status", "draft").select(COLS).maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't approve it. Please try again.", view: saved.view };
  revalidatePath("/assistant");
  const done: Record<KitKind, string> = {
    listing_kit: "Approved. Copy each part where it goes, or print the flyer.",
    listing_presentation: "Approved. Print it or save it as a PDF.",
    buyer_presentation: "Approved. Print it or save it as a PDF.",
    market_update: "Approved.",
    cma_writeup: "Approved. It now shows on the CMA and its printout.",
  };
  return { ok: true, view: toView(data), message: done[kind] };
}

export async function discardKitAction(id: string): Promise<KitResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const current = await loadKit(supabase, id);
  if (!current) return { ok: false, error: "That isn't yours." };
  if (current.status !== "draft") return { ok: false, error: "Only a draft can be discarded.", view: current };
  const { data } = await supabase.from("ai_drafts").update({ status: "discarded" }).eq("id", id).select(COLS).maybeSingle();
  revalidatePath("/assistant");
  return data ? { ok: true, view: toView(data), message: "Discarded. It's deleted after 30 days." } : { ok: false, error: "Couldn't discard it. Please try again.", view: current };
}

/** Records that the approved kit or presentation was copied or printed. */
export async function markKitUsedAction(id: string, via: "copy" | "print"): Promise<void> {
  if (!Id.safeParse(id).success || (via !== "copy" && via !== "print")) return;
  const { supabase } = await staffClient();
  await supabase.from("ai_drafts").update({ sent_via: via }).eq("id", id).eq("status", "approved");
}

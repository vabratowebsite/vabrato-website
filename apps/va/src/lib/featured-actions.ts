"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { ptDayEnd, ptDayStart } from "@/lib/featured";
import type { ActionState } from "@/lib/lead-actions";
import { revalidateNote, revalidateWebsite } from "@/lib/revalidate-web";
import { supabaseServer } from "@/lib/supabase-server";

// Featured listings (0024): any staff member pins or unpins; no approval.
// The website only shows a pin while it's in its window and the listing is
// for sale (IDX).

const LISTING_KEY = /^[A-Za-z0-9._-]{1,64}$/;

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

function pinWindow(form: FormData): { starts_at: string | null; ends_at: string | null } | { error: string } {
  const s = String(form.get("starts") ?? "").trim();
  const e = String(form.get("ends") ?? "").trim();
  const starts_at = s ? ptDayStart(s) : null;
  const ends_at = e ? ptDayEnd(e) : null;
  if ((s && !starts_at) || (e && !ends_at)) return { error: "Use real dates." };
  if (starts_at && ends_at && ends_at <= starts_at) return { error: "The last day must be on or after the first day." };
  return { starts_at, ends_at };
}

export async function addFeaturedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staffClient();
  const key = String(form.get("listing_key") ?? "").trim();
  if (!LISTING_KEY.test(key)) return { error: "Enter the MLS listing key (letters, numbers, dots, dashes or underscores)." };
  const sort = Number(String(form.get("sort") ?? "0") || "0");
  if (!Number.isInteger(sort) || sort < 0 || sort > 1000) return { error: "Order must be a whole number from 0 to 1000." };
  const w = pinWindow(form);
  if ("error" in w) return { error: w.error };
  const { data: listing } = await supabase.from("mls_listings").select("listing_key, standard_status").eq("listing_key", key).maybeSingle();
  // Sold listings aren't visible at IDX level, so "not found" and "not for
  // sale" get the same answer.
  if (!listing || !["Active", "ActiveUnderContract", "Pending"].includes(listing.standard_status ?? ""))
    return { error: "Only listings for sale can be featured. Check the MLS listing key." };
  // Insert, or change the order and dates of an existing pin (the only
  // columns staff may update).
  const { error: insErr } = await supabase.from("featured_listings").insert({ listing_key: key, sort, ...w, created_by: profile.id });
  if (insErr && insErr.code !== "23505") return { error: "Couldn't save the pin." };
  if (insErr) {
    const { error } = await supabase.from("featured_listings").update({ sort, ...w }).eq("listing_key", key);
    if (error) return { error: "Couldn't save the pin." };
  }
  const site = await revalidateWebsite();
  revalidatePath("/featured");
  return { error: null, ok: `Pinned. ${revalidateNote(site)}` };
}

export async function removeFeaturedAction(listingKey: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const key = z.string().regex(LISTING_KEY).parse(listingKey);
  const { error } = await supabase.from("featured_listings").delete().eq("listing_key", key);
  if (error) return { error: "Couldn't remove the pin." };
  const site = await revalidateWebsite();
  revalidatePath("/featured");
  // The row (and its form) goes away, so the page says it.
  redirect(`/featured?done=removed&site=${site === "done" ? "now" : "later"}`);
}

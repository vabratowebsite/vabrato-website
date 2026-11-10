"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPropertyStatus, parsePropertyForm } from "@vabrato/lib";
import { listingTitle } from "@/lib/format";
import { cards } from "@/member/listings";
import { LISTING_KEY } from "@/member/saved";
import { requireMember } from "@/member/session";

// "Homes I'm pursuing" (the buyer tracker moved from apps/buyer). RLS: the
// buyer owns their rows; staff can read them but not change them.

export interface TrackFormState {
  status: "idle" | "error";
  message?: string;
}

export async function addTrackedAction(_prev: TrackFormState, form: FormData): Promise<TrackFormState> {
  const { supabase } = await requireMember("/my/buyer");
  const listingKey = form.get("listingKey");
  if (typeof listingKey === "string" && listingKey) {
    // From a saved home: the address comes from the listing as shown publicly (hidden addresses stay hidden).
    if (!LISTING_KEY.test(listingKey)) return { status: "error", message: "Choose a saved home." };
    const [card] = await cards(supabase, [listingKey]);
    if (!card) return { status: "error", message: "That home is no longer on the market." };
    const address = `${listingTitle(card)}${card.address_display && card.city ? `, ${card.city}` : ""}`;
    const { error } = await supabase.from("tracked_properties").insert({ address, source: "Saved home", status: "watching", listing_key: listingKey });
    if (error) return { status: "error", message: error.code === "23505" ? "You're already tracking that home." : "We couldn't add that home. Please try again." };
  } else {
    const parsed = parsePropertyForm(form);
    if (!parsed.data) return { status: "error", message: parsed.error };
    const { error } = await supabase.from("tracked_properties").insert(parsed.data);
    if (error) return { status: "error", message: "We couldn't add that home. Please try again." };
  }
  revalidatePath("/my/buyer");
  return { status: "idle" };
}

export async function updateTrackedStatusAction(form: FormData) {
  const { supabase } = await requireMember("/my/buyer");
  const id = z.string().uuid().safeParse(form.get("id"));
  const status = form.get("status");
  if (!id.success || !isPropertyStatus(status)) return;
  await supabase.from("tracked_properties").update({ status }).eq("id", id.data);
  revalidatePath(`/my/pursuing/${id.data}`);
  revalidatePath("/my/buyer");
}

export async function deleteTrackedAction(form: FormData) {
  const { supabase } = await requireMember("/my/buyer");
  const id = z.string().uuid().safeParse(form.get("id"));
  if (id.success) await supabase.from("tracked_properties").delete().eq("id", id.data);
  revalidatePath("/my/buyer");
  redirect("/my/buyer");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

// Deal ↔ MLS listing link (seller portal listing activity) and open-house
// sign-in links (S5 PR 5). RLS: staff update only deals they can access; the
// DB function creates links only for Vabrato's own listings.

export interface ListingKeyState {
  error: string | null;
  saved?: boolean;
}

const LISTING_KEY = /^[A-Za-z0-9._-]{1,64}$/;

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return supabase;
}

export async function setListingKeyAction(dealId: string, _prev: ListingKeyState, form: FormData): Promise<ListingKeyState> {
  const supabase = await staffClient();
  const raw = String(form.get("listingKey") ?? "").trim();
  if (raw && !LISTING_KEY.test(raw)) return { error: "Use the MLS listing key: letters, numbers, dots, dashes or underscores." };
  const { data, error } = await supabase.from("deals").update({ listing_key: raw || null }).eq("id", z.string().uuid().parse(dealId)).select("id");
  if (error) return { error: "Couldn't save the listing key." };
  if (!data?.length) return { error: "You can't edit this deal." };
  revalidatePath(`/deals/${dealId}`);
  return { error: null, saved: true };
}

export async function createSigninLinkAction(openHouseKey: string) {
  const supabase = await staffClient();
  await supabase.rpc("open_house_signin_link", { p_open_house_key: z.string().min(1).max(64).parse(openHouseKey) });
  revalidatePath("/open-houses");
}

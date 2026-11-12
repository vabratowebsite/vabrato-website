"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  STAFF_ROLES,
  buildSellerNotificationRows,
  createServiceSupabase,
  fmtLong,
  generateSchedule,
  getProfile,
  signOut,
  todayISO,
} from "@vabrato/lib";
import { parseDealForm } from "@/lib/deal-schema";
import { isOwnReceiptUpload } from "@/lib/documents";
import { parseReceiptForm } from "@/lib/receipt-schema";
import { supabaseServer } from "@/lib/supabase-server";

export async function signOutAction() {
  const supabase = await supabaseServer();
  await signOut(supabase);
  redirect("/login");
}

export interface FormState {
  error: string | null;
  /** Set after a successful save, so a form can reset itself. */
  ok?: boolean;
}

/**
 * Creates the deal, then materializes the engine's schedule into task and
 * contingency rows. RLS enforces staff + deal access; agent_id is set to the
 * creator so agents can see the deals they open.
 */
export async function createDealAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseDealForm(form);
  if (parsed.error !== null) return { error: parsed.error };
  const input = parsed.data;

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const schedule = generateSchedule({
    ratificationDate: input.ratification_date,
    daysToClose: input.days_to_close,
    sellerType: input.seller_type,
    rentBackDays: input.rent_back_days,
    contingencies: input.contingencies,
  });

  // The id is made here and the row isn't read back: under RLS a non-admin
  // can't read their new deal in the same statement (has_deal_access runs on
  // the statement's snapshot, which doesn't have the row yet), so
  // insert(...).select() failed for every agent and VA.
  const deal = { id: randomUUID() };
  const { error: dealError } = await supabase
    .from("deals")
    .insert({
      id: deal.id,
      address: input.address,
      escrow_number: input.escrow_number || null,
      seller_name: input.seller_name || null,
      seller_type: input.seller_type,
      ratification_date: input.ratification_date,
      days_to_close: input.days_to_close,
      rent_back_days: input.rent_back_days,
      sale_price: input.sale_price,
      agent_id: auth.user.id,
    });
  if (dealError) {
    return { error: `Could not create deal: ${dealError.message}` };
  }

  const { error: taskError } = await supabase.from("tasks").insert(
    schedule.tasks.map((t) => ({
      deal_id: deal.id,
      title: t.title,
      owner: t.owner,
      phase: t.phase,
      offset_days: t.offsetDays,
      due_date: t.dueDate,
    })),
  );

  // The contingencies entered on the form (none for an all-cash, as-is offer).
  const { error: contingencyError } = input.contingencies.length
    ? await supabase.from("deal_contingencies").insert(
        input.contingencies.map((c) => ({
          deal_id: deal.id,
          kind: c.kind,
          offset_days: c.offsetDays,
          due_date: schedule.timeline.contingencyRemovals.find((r) => r.kind === c.kind)?.dueDate,
        })),
      )
    : { error: null };

  if (taskError || contingencyError) {
    // Deal exists but the schedule didn't fully land — surface it rather than
    // leaving a half-built deal silently.
    return {
      error: `Deal created but schedule failed: ${(taskError ?? contingencyError)?.message}`,
    };
  }

  redirect(`/deals/${deal.id}`);
}

/**
 * Gives a seller access to a deal without sending any email (works around the
 * built-in mailer rate limit): the auth user is created directly via the
 * service role with the email pre-confirmed, the profile is promoted to
 * 'seller' (never downgrading staff), and a deal_members row links them.
 * The seller signs in later with a normal magic link to the same address.
 */
export async function inviteSellerAction(
  dealId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address" };

  const supabase = await supabaseServer();
  const me = await getProfile(supabase);
  if (!me || !STAFF_ROLES.includes(me.role)) return { error: "Staff only" };

  const service = createServiceSupabase();

  let sellerId: string;
  const { data: existing } = await service
    .from("profiles")
    .select("id, role")
    .eq("email", email.data)
    .maybeSingle();

  if (existing) {
    sellerId = existing.id;
    // A buyer who is now also selling sees both sections of /my.
    if (existing.role === "buyer") {
      await service.from("profiles").update({ role: "both" }).eq("id", existing.id);
    }
  } else {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: email.data,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return { error: `Could not create user: ${createError?.message ?? "unknown error"}` };
    }
    sellerId = created.user.id;
    await service.from("profiles").update({ role: "seller" }).eq("id", sellerId);
  }

  const { error: memberError } = await supabase
    .from("deal_members")
    .upsert({ deal_id: dealId, profile_id: sellerId, member_role: "seller" });
  if (memberError) return { error: memberError.message };

  // Queue the seller's scheduled emails (future sends only). Re-inviting
  // replaces any still-scheduled rows rather than duplicating them.
  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (deal) {
    const schedule = generateSchedule({
      ratificationDate: deal.ratification_date,
      daysToClose: deal.days_to_close,
      sellerType: deal.seller_type,
      rentBackDays: deal.rent_back_days,
    });
    const merge = {
      address: deal.address,
      sellerName: deal.seller_name ?? "",
      coe: fmtLong(schedule.timeline.coe),
      ...(schedule.timeline.rentBackEnd
        ? { rentBackEnd: fmtLong(schedule.timeline.rentBackEnd) }
        : {}),
    };
    const rows = buildSellerNotificationRows(schedule, merge, todayISO());
    await supabase
      .from("notifications")
      .delete()
      .eq("deal_id", dealId)
      .eq("recipient_profile_id", sellerId)
      .eq("status", "scheduled");
    if (rows.length) {
      const { error: notifyError } = await supabase
        .from("notifications")
        .insert(rows.map((r) => ({ ...r, deal_id: dealId, recipient_profile_id: sellerId })));
      if (notifyError) console.error("[inviteSeller] notifications insert:", notifyError.message);
    }
  }

  revalidatePath(`/deals/${dealId}`);
  return { error: null };
}

export async function removeMemberAction(dealId: string, profileId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("deal_members")
    .delete()
    .eq("deal_id", dealId)
    .eq("profile_id", profileId);
  if (error) console.error("[removeMember]", error.message);
  revalidatePath(`/deals/${dealId}`);
}

export async function toggleTaskAction(taskId: string, dealId: string, done: boolean) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) console.error("[toggleTask]", error.message);
  revalidatePath(`/deals/${dealId}`);
}

export async function addReceiptAction(
  dealId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = parseReceiptForm(form);
  if (parsed.error !== null) return { error: parsed.error };

  const supabase = await supabaseServer();
  // An attached file (S6b PR 7a): only one the person uploaded to their own
  // folder on this deal.
  const file = String(form.get("storage_path") ?? "");
  let storagePath: string | null = null;
  if (file) {
    const profile = await getProfile(supabase);
    if (!profile || !isOwnReceiptUpload(file, dealId, profile.id)) return { error: "Upload the receipt again." };
    // The hourly tidy-up may have removed an upload left unsaved; check it's still there.
    const { data: there } = await supabase.storage
      .from("receipts")
      .exists(file)
      .catch(() => ({ data: false }));
    if (there !== true) return { error: "Upload the receipt again." };
    storagePath = file;
  }
  const { error } = await supabase.from("receipts").insert({
    deal_id: dealId,
    vendor: parsed.data.vendor,
    amount: parsed.data.amount,
    category: parsed.data.category,
    receipt_date: parsed.data.receipt_date,
    source: "manual",
    storage_path: storagePath,
  });
  if (error) return { error: error.message };
  revalidatePath(`/deals/${dealId}/receipts`);
  return { error: null, ok: true };
}

export async function deleteReceiptAction(receiptId: string, dealId: string) {
  const supabase = await supabaseServer();
  const { data: rows, error } = await supabase.from("receipts").delete().eq("id", receiptId).select("storage_path");
  if (error) console.error("[deleteReceipt]", error.message);
  const path = rows?.[0]?.storage_path;
  if (path) await supabase.storage.from("receipts").remove([path]);
  revalidatePath(`/deals/${dealId}/receipts`);
}

export async function addVendorAction(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "").trim();
  if (!name || !role) return { error: "Name and role are required" };
  const phone = String(form.get("phone") ?? "").trim() || null;
  const email = String(form.get("email") ?? "").trim() || null;
  if (email && !z.string().email().safeParse(email).success) {
    return { error: "Enter a valid email address" };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.from("vendors").insert({
    name,
    role,
    phone,
    email,
    preferred: form.get("preferred") === "on",
  });
  if (error) return { error: error.message };
  revalidatePath("/vendors");
  return { error: null };
}

export async function toggleVendorPreferredAction(vendorId: string, preferred: boolean) {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("vendors").update({ preferred }).eq("id", vendorId);
  if (error) console.error("[toggleVendorPreferred]", error.message);
  revalidatePath("/vendors");
}

export async function deleteVendorAction(vendorId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("vendors").delete().eq("id", vendorId);
  if (error) console.error("[deleteVendor]", error.message);
  revalidatePath("/vendors");
}

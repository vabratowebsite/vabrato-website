"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/member/session";

// Member → their Vabrato team. Plain text only, 1–4000 characters; the DB
// rate-limits senders (review item 9).

export interface MessageFormState {
  status: "idle" | "sent" | "error";
  message?: string;
}

export async function sendMessageAction(_prev: MessageFormState, form: FormData): Promise<MessageFormState> {
  const { supabase, profile } = await requireMember("/my/messages");
  const body = z.string().trim().min(1).max(4000).safeParse(form.get("body"));
  if (!body.success) return { status: "error", message: "Write a message of up to 4,000 characters." };
  const { error } = await supabase.from("messages").insert({ member_id: profile.id, sender_id: profile.id, body: body.data });
  if (error) {
    return {
      status: "error",
      message: /messages_rate_limited/.test(error.message) ? "You've sent a lot of messages in a short time. Please wait a few minutes." : "We couldn't send that. Please try again.",
    };
  }
  revalidatePath("/my/messages");
  return { status: "sent", message: "Sent. Your agent will reply here." };
}

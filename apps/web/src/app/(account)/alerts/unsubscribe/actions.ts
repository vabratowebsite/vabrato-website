"use server";

import { unsubscribeAlerts } from "@/member/unsubscribe";

export interface UnsubscribeState {
  status: "idle" | "done" | "error";
}

export async function unsubscribeAction(_prev: UnsubscribeState, form: FormData): Promise<UnsubscribeState> {
  const token = form.get("t");
  if (typeof token !== "string") return { status: "error" };
  try {
    // Same answer whether or not the token matched an account.
    await unsubscribeAlerts(token);
    return { status: "done" };
  } catch {
    return { status: "error" };
  }
}

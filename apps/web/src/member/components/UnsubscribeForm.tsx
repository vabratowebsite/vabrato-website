"use client";

import { useActionState } from "react";
import { unsubscribeAction, type UnsubscribeState } from "@/app/(account)/alerts/unsubscribe/actions";
import { SubmitButton } from "./controls";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<UnsubscribeState, FormData>(unsubscribeAction, { status: "idle" });
  if (state.status === "done") {
    return (
      <p role="status" className="font-body text-body text-ink">
        You&apos;re unsubscribed from alert emails. Your saved homes and searches are still in your portal, and you can turn emails back on in your account settings.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      {state.status === "error" && (
        <p role="alert" className="font-body text-body-sm font-medium text-red">
          Something went wrong. Please try again, or turn alerts off in your account.
        </p>
      )}
      <SubmitButton pending={pending}>Unsubscribe from alert emails</SubmitButton>
    </form>
  );
}

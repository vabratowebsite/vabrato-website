"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessageAction, type MessageFormState } from "@/app/my/messages/actions";
import { FormMessage, SubmitButton } from "./controls";

export function MessageForm() {
  const [state, action, pending] = useActionState<MessageFormState, FormData>(sendMessageAction, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "sent") form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3 font-body">
      <label htmlFor="message-body" className="block text-body-sm font-medium text-ink">
        Message your agent
      </label>
      <textarea id="message-body" name="body" rows={4} maxLength={4000} required className="block w-full border border-muted bg-white px-3 py-2 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy" />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Send</SubmitButton>
    </form>
  );
}

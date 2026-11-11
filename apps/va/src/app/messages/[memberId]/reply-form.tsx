"use client";

import { useActionState, useEffect, useRef } from "react";
import { btnPrimary, errorCls, inputCls, labelCls } from "@/components/ui";
import { replyAction, type ReplyState } from "@/lib/member-actions";

export function ReplyForm({ memberId }: { memberId: string }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyAction.bind(null, memberId), { error: null });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.sent) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3">
      <label htmlFor="reply" className={labelCls}>
        Reply
      </label>
      <textarea id="reply" name="body" rows={4} maxLength={4000} required className={inputCls} />
      {state.error && (
        <p role="alert" className={errorCls}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={btnPrimary}>
        Send reply
      </button>
    </form>
  );
}

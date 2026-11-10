"use client";

import { useActionState, useEffect, useRef } from "react";
import { T } from "@vabrato/ui";
import { replyAction, type ReplyState } from "@/lib/member-actions";

export function ReplyForm({ memberId }: { memberId: string }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyAction.bind(null, memberId), { error: null });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.sent) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-2">
      <label htmlFor="reply" className="block text-sm font-medium">
        Reply
      </label>
      <textarea id="reply" name="body" rows={4} maxLength={4000} required className="w-full rounded-lg p-3 text-sm" style={{ border: `1px solid ${T.line}` }} />
      {state.error && (
        <p role="alert" className="text-sm" style={{ color: T.red }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: T.ink, color: T.gold }}>
        Send reply
      </button>
    </form>
  );
}

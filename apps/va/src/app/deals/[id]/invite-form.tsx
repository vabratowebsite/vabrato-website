"use client";

import { useActionState } from "react";
import { T } from "@vabrato/ui";
import { inviteSellerAction, type FormState } from "@/lib/actions";

export function InviteForm({ dealId }: { dealId: string }) {
  const action = inviteSellerAction.bind(null, dealId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        name="email"
        required
        placeholder="seller@example.com"
        className="min-w-52 flex-1 rounded-lg px-3 py-2 text-sm"
        style={{ border: `1px solid ${T.line}`, background: T.surface }}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: T.ink, color: T.gold }}
      >
        {pending ? "Adding…" : "Give seller access"}
      </button>
      {state.error && (
        <p className="w-full text-sm" style={{ color: T.red }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

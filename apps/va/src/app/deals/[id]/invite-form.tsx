"use client";

import { useActionState } from "react";
import { btnPrimary, errorCls, inputCls, labelCls } from "@/components/ui";
import { inviteSellerAction, type FormState } from "@/lib/actions";

export function InviteForm({ dealId }: { dealId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(inviteSellerAction.bind(null, dealId), { error: null });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className={`${labelCls} min-w-52 flex-1`}>
        Seller&apos;s email
        <input type="email" name="email" required placeholder="seller@example.com" className={`${inputCls} mt-1`} />
      </label>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Adding…" : "Give seller access"}
      </button>
      {state.error && (
        <p role="alert" className={`${errorCls} w-full`}>
          {state.error}
        </p>
      )}
    </form>
  );
}

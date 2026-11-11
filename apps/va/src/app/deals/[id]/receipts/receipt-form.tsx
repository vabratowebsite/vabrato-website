"use client";

import { useActionState } from "react";
import { btnPrimary, errorCls, inputCls, labelCls } from "@/components/ui";
import { addReceiptAction, type FormState } from "@/lib/actions";

export function ReceiptForm({ dealId }: { dealId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addReceiptAction.bind(null, dealId), { error: null });

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <label className={labelCls}>
        Vendor
        <input name="vendor" required className={`${inputCls} mt-1`} />
      </label>
      <label className={labelCls}>
        Amount ($)
        <input name="amount" required type="number" step="0.01" min="0.01" className={`${inputCls} mt-1`} />
      </label>
      <label className={labelCls}>
        Category (optional)
        <input name="category" className={`${inputCls} mt-1`} />
      </label>
      <label className={labelCls}>
        Receipt date (optional)
        <input name="receipt_date" type="date" className={`${inputCls} mt-1`} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Adding…" : "Add receipt"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className={`${errorCls} sm:col-span-2`}>
          {state.error}
        </p>
      )}
    </form>
  );
}

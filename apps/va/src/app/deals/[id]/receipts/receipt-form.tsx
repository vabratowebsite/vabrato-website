"use client";

import { useActionState } from "react";
import { T } from "@vabrato/ui";
import { addReceiptAction, type FormState } from "@/lib/actions";

const inputStyle = { border: `1px solid ${T.line}`, background: T.surface };

export function ReceiptForm({ dealId }: { dealId: string }) {
  const action = addReceiptAction.bind(null, dealId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-5">
      <input
        name="vendor"
        required
        placeholder="Vendor"
        className="rounded-lg px-3 py-2 text-sm"
        style={inputStyle}
      />
      <input
        name="amount"
        required
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Amount"
        className="rounded-lg px-3 py-2 text-sm"
        style={inputStyle}
      />
      <input
        name="category"
        placeholder="Category"
        className="rounded-lg px-3 py-2 text-sm"
        style={inputStyle}
      />
      <input
        name="receipt_date"
        type="date"
        className="rounded-lg px-3 py-2 text-sm"
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: T.ink, color: T.gold }}
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error && (
        <p className="text-sm sm:col-span-5" style={{ color: T.red }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

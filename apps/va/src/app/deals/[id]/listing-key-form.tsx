"use client";

import { useActionState } from "react";
import { btnPrimary, errorCls, inputCls, labelCls, okCls } from "@/components/ui";
import { setListingKeyAction, type ListingKeyState } from "@/lib/listing-actions";

export function ListingKeyForm({ dealId, current }: { dealId: string; current: string | null }) {
  const [state, formAction, pending] = useActionState<ListingKeyState, FormData>(setListingKeyAction.bind(null, dealId), { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className={`${labelCls} min-w-52 flex-1`}>
        MLS listing key
        <input name="listingKey" defaultValue={current ?? ""} placeholder="e.g. ML81234567" maxLength={64} className={`${inputCls} mt-1`} />
      </label>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && (
        <p role="alert" className={`${errorCls} w-full`}>
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className={`${okCls} w-full`}>
          Saved. The seller sees listing activity in their portal.
        </p>
      )}
    </form>
  );
}

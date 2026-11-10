"use client";

import { useActionState } from "react";
import { T } from "@vabrato/ui";
import { setListingKeyAction, type ListingKeyState } from "@/lib/listing-actions";

export function ListingKeyForm({ dealId, current }: { dealId: string; current: string | null }) {
  const [state, formAction, pending] = useActionState<ListingKeyState, FormData>(setListingKeyAction.bind(null, dealId), { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1 text-sm">
        <span className="mb-1 block" style={{ color: T.muted }}>
          MLS listing key
        </span>
        <input
          name="listingKey"
          defaultValue={current ?? ""}
          placeholder="e.g. ML81234567"
          maxLength={64}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ border: `1px solid ${T.line}`, background: T.surface }}
        />
      </label>
      <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: T.ink, color: T.gold }}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && (
        <p role="alert" className="w-full text-sm" style={{ color: T.red }}>
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="w-full text-sm" style={{ color: T.green }}>
          Saved. The seller sees listing activity in their portal.
        </p>
      )}
    </form>
  );
}

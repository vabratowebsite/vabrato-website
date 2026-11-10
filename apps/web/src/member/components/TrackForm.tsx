"use client";

import { useActionState } from "react";
import { addTrackedAction, type TrackFormState } from "@/app/my/pursuing/actions";
import { TextField } from "@/components/forms/fields";
import { FormMessage, SubmitButton } from "./controls";

export function TrackForm({ saved }: { saved: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState<TrackFormState, FormData>(addTrackedAction, { status: "idle" });
  return (
    <div className="space-y-6">
      {saved.length > 0 && (
        <form action={action} className="flex flex-wrap items-end gap-3 font-body">
          <label className="flex min-w-[240px] flex-1 flex-col text-body-sm font-medium text-ink">
            Track one of your saved homes
            <select name="listingKey" required defaultValue="" className="mt-1 min-h-[44px] border border-muted bg-white px-3 text-body font-normal">
              <option value="" disabled>
                Choose a saved home
              </option>
              {saved.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton pending={pending} variant="outline">
            Track this home
          </SubmitButton>
        </form>
      )}
      <form action={action} className="grid gap-3 font-body sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <TextField label="Or enter any address" name="address" autoComplete="street-address" required />
        <TextField label="Where you found it (optional)" name="source" />
        <SubmitButton pending={pending}>Track a property</SubmitButton>
      </form>
      <FormMessage status={state.status} message={state.message} />
    </div>
  );
}

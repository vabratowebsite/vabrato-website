"use client";

import { useActionState } from "react";
import { updateSearchAction, type SearchFormState } from "@/app/my/searches/actions";
import { FREQUENCIES, type Frequency } from "../saved";
import { FormMessage, SubmitButton } from "./controls";

const idle: SearchFormState = { status: "idle" };

export function SavedSearchForm({ id, name, frequency }: { id: string; name: string; frequency: Frequency }) {
  const [state, action, pending] = useActionState(updateSearchAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 font-body">
      <input type="hidden" name="id" value={id} />
      <label className="flex min-w-[220px] flex-1 flex-col text-body-sm font-medium text-ink">
        Name
        <input name="name" defaultValue={name} maxLength={80} required className="mt-1 min-h-[44px] border border-muted px-3 text-body font-normal" />
      </label>
      <label className="flex flex-col text-body-sm font-medium text-ink">
        Alerts
        <select name="frequency" defaultValue={frequency} className="mt-1 min-h-[44px] border border-muted bg-white px-3 text-body font-normal">
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pending={pending} variant="outline">
        Save<span className="sr-only"> {name}</span>
      </SubmitButton>
      <div className="basis-full">
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}

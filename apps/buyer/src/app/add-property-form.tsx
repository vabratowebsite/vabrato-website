"use client";

import { useActionState } from "react";
import { T } from "@vabrato/ui";
import { addPropertyAction, type FormState } from "@/lib/actions";

const inputStyle = { border: `1px solid ${T.line}`, background: T.surface };

export function AddPropertyForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addPropertyAction, {
    error: null,
  });

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-4">
      <input
        name="address"
        required
        placeholder="Property address"
        className="rounded-lg px-3 py-2 text-sm sm:col-span-2"
        style={inputStyle}
      />
      <input
        name="source"
        placeholder="Source (Zillow, agent…)"
        className="rounded-lg px-3 py-2 text-sm"
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: T.ink, color: T.gold }}
      >
        {pending ? "Adding…" : "Track it"}
      </button>
      {state.error && (
        <p className="text-sm sm:col-span-4" style={{ color: T.red }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

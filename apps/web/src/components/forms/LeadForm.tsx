"use client";

import { useActionState, type ReactNode } from "react";
import { submitLead, type LeadFormState } from "@/app/actions/leads";
import type { LeadKind } from "@/lib/leads";
import { TextField } from "./fields";
import { Turnstile } from "./Turnstile";

// Shared public lead form: name, email, phone, the kind-specific fields passed
// as children, the call/text consent line and the privacy notice at the point
// of collection (review item 4), a honeypot and Turnstile (review item 12).

export function LeadForm({
  kind,
  listingKey,
  citySlug,
  site = "vabrato",
  submitLabel,
  successMessage = "Thanks. An agent will reply within one business day.",
  tone = "light",
  askPhone = true,
  children,
}: {
  kind: LeadKind;
  listingKey?: string;
  citySlug?: string;
  site?: "vabrato" | "sancarloslife";
  submitLabel: string;
  successMessage?: string;
  tone?: "light" | "dark";
  askPhone?: boolean;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState<LeadFormState, FormData>(submitLead, { status: "idle" });
  const err = state.fieldErrors ?? {};
  const text = tone === "dark" ? "text-white" : "text-ink";
  const muted = tone === "dark" ? "text-white/85" : "text-muted";

  if (state.status === "sent") {
    return (
      <p role="status" className={`font-body text-body ${text}`}>
        {successMessage}
      </p>
    );
  }

  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="site" value={site} />
      {listingKey && <input type="hidden" name="listingKey" value={listingKey} />}
      {citySlug && <input type="hidden" name="citySlug" value={citySlug} />}
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {children}

      <TextField label="Name" name="name" autoComplete="name" error={err.name} tone={tone} />
      <TextField label="Email (required)" name="email" type="email" autoComplete="email" required error={err.email} tone={tone} />
      {askPhone && <TextField label="Phone" name="phone" type="tel" autoComplete="tel" error={err.phone} tone={tone} />}

      {askPhone && (
        <label className={`flex items-start gap-3 font-body text-body-sm ${text}`}>
          <input type="checkbox" name="consentContact" className="mt-1 h-5 w-5 shrink-0 accent-navy" />
          <span>Vabrato agents may call or text me about this request. Message and data rates may apply. Not required.</span>
        </label>
      )}

      <Turnstile />

      <p className={`font-body text-caption ${muted}`}>
        We use your details only to answer this request. See our{" "}
        <a href="/privacy" className="underline">
          privacy notice
        </a>
        .
      </p>

      {state.status === "error" && state.message && (
        <p role="alert" className={`font-body text-body-sm font-medium ${tone === "dark" ? "text-white" : "text-red"}`}>
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] w-full items-center justify-center bg-gold px-6 py-3 font-body text-[12px] font-medium uppercase tracking-label text-navy hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-navy disabled:opacity-60"
      >
        {pending ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}

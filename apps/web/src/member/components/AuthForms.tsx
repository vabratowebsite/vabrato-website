"use client";

import { useActionState } from "react";
import { joinAction, signInAction, type AuthFormState } from "@/app/(account)/actions";
import { TextField } from "@/components/forms/fields";
import { Turnstile } from "@/components/forms/Turnstile";
import type { MemberRole } from "../roles";
import { Checkbox, FormMessage, Honeypot, SubmitButton } from "./controls";

const idle: AuthFormState = { status: "idle" };

function Sent({ email }: { email?: string }) {
  return (
    <div role="status" className="space-y-2 font-body text-body text-ink">
      <p className="font-medium">Check your email.</p>
      <p>
        {email ? (
          <>
            If <strong>{email}</strong> can sign in, a link is on its way.
          </>
        ) : (
          "Your sign-in link is on its way."
        )}{" "}
        Open it in this browser; it works once and expires in an hour.
      </p>
    </div>
  );
}

/** Join step 2 (mockup 04): details, consents, magic link or Google. */
export function JoinForm({ role, next, vowEnabled }: { role: MemberRole; next?: string; vowEnabled: boolean }) {
  const [state, action, pending] = useActionState(joinAction, idle);
  const err = state.fieldErrors ?? {};
  if (state.status === "sent") return <Sent email={state.email} />;

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="role" value={role} />
      {next && <input type="hidden" name="next" value={next} />}
      <Honeypot />
      <TextField label="Full name" name="fullName" autoComplete="name" required error={err.fullName} />
      <TextField label="Mobile (optional, for tour texts)" name="phone" type="tel" autoComplete="tel" inputMode="tel" error={err.phone} />
      <TextField label="Email address" name="email" type="email" autoComplete="email" required error={err.email} />
      {vowEnabled && (
        <Checkbox
          name="vow"
          error={err.vow}
          label={
            <>
              I&apos;m interested in buying or selling and agree to the{" "}
              <a href="/vow-terms" className="text-navy underline">
                Terms of Use
              </a>
              : listing data is for my personal, non-commercial use, MLSListings owns the MLS data, and I&apos;m working with Vabrato as my brokerage.
            </>
          }
        />
      )}
      <Checkbox name="alerts" label="Email me new listings and price drops that match my searches. I can change this anytime." />
      <p className="font-body text-caption text-muted">
        By creating an account you agree to our{" "}
        <a href="/terms" className="text-navy underline">
          Terms of use
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-navy underline">
          Privacy notice
        </a>
        . No passwords: we email you a sign-in link.
      </p>
      <Turnstile />
      <FormMessage status={state.status} message={state.message} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} name="provider" value="email">
          Email me a sign-in link
        </SubmitButton>
        <SubmitButton pending={pending} name="provider" value="google" variant="outline" formNoValidate>
          Continue with Google
        </SubmitButton>
      </div>
    </form>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, idle);
  const err = state.fieldErrors ?? {};
  if (state.status === "sent") return <Sent email={state.email} />;

  return (
    <form action={action} noValidate className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <Honeypot />
      <TextField label="Email address" name="email" type="email" autoComplete="email" required error={err.email} />
      <Turnstile />
      <FormMessage status={state.status} message={state.message} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} name="provider" value="email">
          Email me a sign-in link
        </SubmitButton>
        <SubmitButton pending={pending} name="provider" value="google" variant="outline" formNoValidate>
          Continue with Google
        </SubmitButton>
      </div>
    </form>
  );
}

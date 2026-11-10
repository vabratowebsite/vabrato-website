"use client";

import { useActionState } from "react";
import {
  acceptVowAction,
  onboardingAction,
  requestDeletionAction,
  setAlertsAction,
  setRoleAction,
  updateProfileAction,
  type AccountFormState,
} from "@/app/my/actions";
import { TextField } from "@/components/forms/fields";
import { ROLE_CHOICES, type MemberRole } from "../roles";
import { Checkbox, FormMessage, SubmitButton } from "./controls";

const idle: AccountFormState = { status: "idle" };

export function RoleRadios({ current, error }: { current?: MemberRole; error?: string }) {
  return (
    <fieldset aria-describedby={error ? "f-role-error" : undefined}>
      <legend className="font-body text-body-sm font-medium text-ink">What brings you here?</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {ROLE_CHOICES.map((c) => (
          <label key={c.value} className="flex cursor-pointer items-start gap-3 border border-muted bg-white p-4 has-[:checked]:border-navy has-[:checked]:ring-2 has-[:checked]:ring-navy">
            <input type="radio" name="role" value={c.value} defaultChecked={current === c.value} className="mt-1 h-5 w-5 flex-none accent-navy" />
            <span className="font-body">
              <span className="block text-body font-medium text-ink">{c.label}</span>
              <span className="block text-body-sm text-muted">{c.detail}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id="f-role-error" className="mt-1 font-body text-caption font-medium text-red">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string | null; email: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, idle);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <TextField label="Full name" name="fullName" autoComplete="name" defaultValue={fullName} required error={err.fullName} />
      <TextField label="Mobile (optional, for tour texts)" name="phone" type="tel" autoComplete="tel" defaultValue={phone ?? ""} error={err.phone} />
      <p className="font-body text-body-sm text-muted">
        Email: <span className="text-ink">{email}</span>. To change it, message your agent.
      </p>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Save details</SubmitButton>
    </form>
  );
}

export function AlertsForm({ on }: { on: boolean }) {
  const [state, action, pending] = useActionState(setAlertsAction, idle);
  return (
    <form action={action} className="space-y-4">
      <Checkbox name="alerts" defaultChecked={on} label="Email me new listings and price drops that match my saved searches and saved homes." />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending} variant="outline">
        Save alert setting
      </SubmitButton>
    </form>
  );
}

export function RoleForm({ role }: { role: MemberRole }) {
  const [state, action, pending] = useActionState(setRoleAction, idle);
  return (
    <form action={action} className="space-y-4">
      <RoleRadios current={role} error={state.fieldErrors?.role} />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending} variant="outline">
        Update my portal
      </SubmitButton>
    </form>
  );
}

export function VowForm() {
  const [state, action, pending] = useActionState(acceptVowAction, idle);
  return (
    <form action={action} className="space-y-4">
      <Checkbox
        name="vow"
        error={state.fieldErrors?.vow}
        label={
          <>
            I agree to the{" "}
            <a href="/vow-terms" className="text-navy underline">
              Terms of Use
            </a>
            : listing data is for my personal, non-commercial use, MLSListings owns the MLS data, and I&apos;m working with Vabrato as my brokerage.
          </>
        }
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Accept and see sold data</SubmitButton>
    </form>
  );
}

export function DeletionForm() {
  const [state, action, pending] = useActionState(requestDeletionAction, idle);
  if (state.status === "saved") return <FormMessage status="saved" message={state.message} />;
  return (
    <form action={action} className="space-y-4">
      <Checkbox name="confirm" error={state.fieldErrors?.confirm} label="I want to delete my Vabrato account." />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending} variant="outline">
        Request account deletion
      </SubmitButton>
    </form>
  );
}

/** First visit without join choices (review item 13). */
export function OnboardingForm({ fullName, phone, vowEnabled }: { fullName: string; phone: string | null; vowEnabled: boolean }) {
  const [state, action, pending] = useActionState(onboardingAction, idle);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-5">
      <RoleRadios error={err.role} />
      <TextField label="Full name" name="fullName" autoComplete="name" defaultValue={fullName} required error={err.fullName} />
      <TextField label="Mobile (optional, for tour texts)" name="phone" type="tel" autoComplete="tel" defaultValue={phone ?? ""} error={err.phone} />
      {vowEnabled && (
        <Checkbox
          name="vow"
          label={
            <>
              I agree to the{" "}
              <a href="/vow-terms" className="text-navy underline">
                Terms of Use
              </a>{" "}
              for sold prices and price history (optional).
            </>
          }
        />
      )}
      <Checkbox name="alerts" label="Email me new listings and price drops that match my searches. I can change this anytime." />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Continue to my portal</SubmitButton>
    </form>
  );
}

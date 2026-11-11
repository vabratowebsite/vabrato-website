"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/lead-actions";
import { btnPrimary, btnSecondary, errorCls, okCls } from "./ui";

// A form bound to one server action, with its error or success message read
// out (role=alert / role=status). One submit button per form: button
// name/value isn't reliably sent with server actions.
export function ActionForm({
  action,
  submitLabel,
  submitAriaLabel,
  pendingLabel = "Saving…",
  secondary,
  resetOnOk,
  className = "space-y-4",
  children,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  /** Fuller name when the visible label repeats in a list ("Unpin 123 Main St"). */
  submitAriaLabel?: string;
  pendingLabel?: string;
  secondary?: boolean;
  resetOnOk?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { error: null });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnOk && state.ok) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} aria-label={submitAriaLabel} className={secondary ? btnSecondary : btnPrimary}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {state.error && (
          <p role="alert" className={errorCls}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className={okCls}>
            {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}

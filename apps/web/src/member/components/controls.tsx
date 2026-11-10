import type { ReactNode } from "react";

// Small accessible controls shared by the join, sign-in and account forms.

export function Checkbox({ name, label, error, defaultChecked }: { name: string; label: ReactNode; error?: string; defaultChecked?: boolean }) {
  return (
    <div className="font-body">
      <label className="flex items-start gap-3 text-body-sm text-ink">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `f-${name}-error` : undefined}
          className="mt-1 h-5 w-5 flex-none accent-navy"
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={`f-${name}-error`} className="mt-1 pl-8 text-caption font-medium text-red">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ status, message }: { status: "idle" | "sent" | "saved" | "error"; message?: string }) {
  if (!message || status === "idle") return null;
  const isError = status === "error";
  return (
    <p role={isError ? "alert" : "status"} className={`font-body text-body-sm ${isError ? "font-medium text-red" : "text-green"}`}>
      {message}
    </p>
  );
}

export function SubmitButton({ children, pending, variant = "navy", ...rest }: { children: ReactNode; pending?: boolean; variant?: "navy" | "outline" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls =
    variant === "navy"
      ? "bg-navy text-white hover:bg-navy-deep disabled:opacity-60"
      : "border border-navy bg-white text-navy hover:bg-navy-50 disabled:opacity-60";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 px-6 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${cls}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Honeypot: hidden from people and assistive tech; bots fill it. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Leave this field empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

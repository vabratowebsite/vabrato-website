import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Labeled form fields with visible labels and linked error text (WCAG 2.2 AA).

const control =
  "mt-1 block w-full min-h-[44px] border border-muted bg-white px-3 py-2 font-body text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy";

interface FieldShell {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  tone?: "light" | "dark";
}

function Shell({ label, name, error, hint, tone = "light", children }: FieldShell & { children: ReactNode }) {
  const labelColor = tone === "dark" ? "text-white" : "text-ink";
  return (
    <div className="font-body">
      <label htmlFor={`f-${name}`} className={`block text-body-sm font-medium ${labelColor}`}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`f-${name}-hint`} className={`mt-1 text-caption ${tone === "dark" ? "text-white/80" : "text-muted"}`}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`f-${name}-error`} className={`mt-1 text-caption font-medium ${tone === "dark" ? "text-white" : "text-red"}`}>
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, error?: string, hint?: ReactNode) =>
  [hint ? `f-${name}-hint` : null, error ? `f-${name}-error` : null].filter(Boolean).join(" ") || undefined;

export function TextField({ label, name, error, hint, tone, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Shell label={label} name={name} error={error} hint={hint} tone={tone}>
      <input id={`f-${name}`} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(name, error, hint)} className={control} {...rest} />
    </Shell>
  );
}

export function TextArea({ label, name, error, hint, tone, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Shell label={label} name={name} error={error} hint={hint} tone={tone}>
      <textarea id={`f-${name}`} name={name} rows={4} aria-invalid={error ? true : undefined} aria-describedby={describedBy(name, error, hint)} className={control} {...rest} />
    </Shell>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  tone,
  children,
  ...rest
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <Shell label={label} name={name} error={error} hint={hint} tone={tone}>
      <select id={`f-${name}`} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(name, error, hint)} className={control} {...rest}>
        {children}
      </select>
    </Shell>
  );
}

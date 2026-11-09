"use client";

import { useId, useState, type FormEvent } from "react";
import { cx, focusLight } from "../cx";
import { Button } from "../site/Button";

export interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  message: string;
  intent: string | null;
}

export interface ContactFormProps {
  title?: string[];
  intents?: string[];
  /** "Your message goes straight to Mark." */
  note?: string;
  action?: string;
  onSubmit?: (data: ContactFormData) => void;
}

/** Agent contact form with intent pills (mockup 09 "Send me a message"). */
export function ContactForm({
  title = ["Send me", "a message"],
  intents = ["Buying", "Selling", "Home value"],
  note,
  action,
  onSubmit,
}: ContactFormProps) {
  const id = useId();
  const [intent, setIntent] = useState<string | null>(null);
  const field = cx(
    "min-h-[40px] w-full border-b border-muted bg-transparent font-body text-body-sm text-ink",
    focusLight,
  );
  const lbl = "font-body text-caption text-muted";

  const handle = (e: FormEvent<HTMLFormElement>) => {
    if (!onSubmit) return;
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSubmit({
      name: String(f.get("name") ?? ""),
      phone: String(f.get("phone") ?? ""),
      email: String(f.get("email") ?? ""),
      message: String(f.get("message") ?? ""),
      intent,
    });
  };

  return (
    <form
      action={action}
      method="post"
      onSubmit={handle}
      aria-labelledby={`${id}-title`}
      className="bg-soft p-8"
    >
      <h2
        id={`${id}-title`}
        className="text-center font-display text-display-sm uppercase text-navy"
      >
        {title.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={lbl}>
            Name
          </label>
          <input id={`${id}-name`} name="name" required autoComplete="name" className={field} />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className={lbl}>
            Phone
          </label>
          <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" className={field} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-email`} className={lbl}>
            Email
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            className={field}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-message`} className={lbl}>
            Message
          </label>
          <textarea
            id={`${id}-message`}
            name="message"
            rows={3}
            className={cx(field, "resize-y")}
          />
        </div>
      </div>
      <fieldset className="mt-5">
        <legend className="sr-only">I&apos;m interested in</legend>
        <div className="flex flex-wrap justify-center gap-2">
          {intents.map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={intent === i}
              onClick={() => setIntent((cur) => (cur === i ? null : i))}
              className={cx(
                "min-h-[28px] rounded-pill border px-3 font-body text-caption",
                intent === i
                  ? "border-navy bg-navy text-white"
                  : "border-muted bg-white text-ink hover:border-navy",
                focusLight,
              )}
            >
              {i}
            </button>
          ))}
        </div>
        <input type="hidden" name="intent" value={intent ?? ""} />
      </fieldset>
      <div className="mt-8 flex justify-center">
        <Button type="submit" size="sm">
          Send
        </Button>
      </div>
      {note && <p className="mt-4 text-center font-body text-caption text-muted">{note}</p>}
    </form>
  );
}

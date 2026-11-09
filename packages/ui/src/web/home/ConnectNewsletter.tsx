"use client";

import { useId, type FormEvent } from "react";
import { cx, focusLight } from "../cx";
import { Button } from "../site/Button";

export interface ConnectNewsletterProps {
  title?: string;
  pitch?: string;
  /** Form action (S4 wires a server action / route). */
  action?: string;
  onSubmit?: (data: { name: string; email: string }) => void;
}

/** "Connect with us" newsletter band (mockups 01, 09). */
export function ConnectNewsletter({
  title = "Connect with us",
  pitch = "Sign up to get the latest market trends and updates about Peninsula real estate.",
  action,
  onSubmit,
}: ConnectNewsletterProps) {
  const id = useId();
  const handle = (e: FormEvent<HTMLFormElement>) => {
    if (!onSubmit) return;
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSubmit({ name: String(f.get("name") ?? ""), email: String(f.get("email") ?? "") });
  };
  const field = cx(
    "min-h-[40px] w-full border-b border-muted bg-transparent font-body text-body-sm text-ink placeholder:text-muted",
    focusLight,
  );
  return (
    <section className="bg-soft">
      <div className="mx-auto grid max-w-site items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
        <h2 className="font-display text-display-md uppercase text-navy">{title}</h2>
        <form action={action} method="post" onSubmit={handle} className="bg-white p-8 shadow-card">
          <p className="font-subhead text-body text-ink">{pitch}</p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-name`} className="font-body text-caption text-muted">
                Name
              </label>
              <input id={`${id}-name`} name="name" autoComplete="name" className={field} />
            </div>
            <div>
              <label htmlFor={`${id}-email`} className="font-body text-caption text-muted">
                Email address
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
          </div>
          <div className="mt-8">
            <Button type="submit" size="sm">
              Sign up now
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

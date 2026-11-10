import type { ReactNode } from "react";

/** Shared shell for the placeholder legal pages (review item 4). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 font-body text-body text-ink md:px-6">
      <h1 className="font-display text-display-sm uppercase tracking-wide text-navy">{title}</h1>
      <p className="mt-2 text-body-sm text-muted">Last updated {updated}</p>
      <p role="note" className="mt-6 border border-gold bg-gold-50 p-4 text-body-sm text-ink">
        Placeholder text for review. Vabrato&apos;s final {title.toLowerCase()} replaces this before launch.
      </p>
      <div className="mt-8 space-y-6 [&_h2]:font-subhead [&_h2]:text-subhead-md [&_h2]:text-navy">{children}</div>
    </article>
  );
}

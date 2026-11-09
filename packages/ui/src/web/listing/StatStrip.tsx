export interface Stat {
  value: string;
  label: string;
}

/**
 * Navy track-record band (mockup 01). Figures derived from MLS statistics
 * are gated by `public_stats` (MLS-10); pages decide what to pass.
 */
export function StatStrip({
  eyebrow,
  title,
  stats,
  footnote,
}: {
  eyebrow?: string;
  title: string;
  stats: Stat[];
  footnote?: string;
}) {
  return (
    <section aria-label={title} className="bg-navy text-white">
      <div className="mx-auto grid max-w-site gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] md:items-center md:px-6">
        <div>
          {eyebrow && (
            <p className="mb-1 font-body text-label uppercase tracking-wide text-gold">{eyebrow}</p>
          )}
          <h2 className="font-display text-display-sm uppercase">{title}</h2>
        </div>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col-reverse">
              <dt className="mt-1 font-body text-label uppercase tracking-label text-white/80">
                {s.label}
              </dt>
              <dd className="font-display text-display-md text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
        {footnote && (
          <p className="font-body text-caption text-white/80 md:col-span-2">{footnote}</p>
        )}
      </div>
    </section>
  );
}

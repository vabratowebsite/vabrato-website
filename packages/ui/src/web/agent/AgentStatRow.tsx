import type { Stat } from "../listing/StatStrip";

/** Bordered row of agent stats (mockup 09: active listings, sold, since, rating). */
export function AgentStatRow({ stats, footnote }: { stats: Stat[]; footnote?: string }) {
  return (
    <div>
      <dl className="grid grid-cols-2 border border-line md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col-reverse px-6 py-5 ${i > 0 ? "border-line md:border-l" : ""} ${i % 2 === 1 ? "border-l" : ""} ${i > 1 ? "border-t md:border-t-0" : ""}`}
          >
            <dt className="mt-1 font-body text-label uppercase tracking-label text-muted">
              {s.label}
            </dt>
            <dd className="font-display text-display-sm text-navy">{s.value}</dd>
          </div>
        ))}
      </dl>
      {footnote && <p className="mt-2 font-body text-caption text-muted">{footnote}</p>}
    </div>
  );
}

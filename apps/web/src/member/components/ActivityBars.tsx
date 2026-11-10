// Weekly listing activity (mockup 06): plain CSS bars with the value printed
// above each one, plus a table for screen readers. No chart library.

export function ActivityBars({ bars, caption }: { bars: { label: string; value: number; pct: number }[]; caption: string }) {
  return (
    <figure>
      <div aria-hidden="true" className="flex h-48 items-end gap-2 sm:gap-3">
        {bars.map((b) => (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="font-body text-caption text-muted">{b.value.toLocaleString("en-US")}</span>
            <span className="w-full bg-navy" style={{ height: `${Math.max(b.pct, b.value > 0 ? 2 : 0)}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-2 border-t border-line pt-2 sm:gap-3">
        {bars.map((b) => (
          <span key={b.label} className="flex-1 text-center font-body text-[11px] text-muted">
            {b.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{b.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

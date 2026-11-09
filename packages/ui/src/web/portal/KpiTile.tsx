/** Big-number KPI tile (mockups 05, 06). */
export function KpiTile({ value, label, delta }: { value: string; label: string; delta?: string }) {
  return (
    <div className="flex flex-col-reverse border border-line bg-white px-6 py-5">
      <p className="mt-1 font-body text-label uppercase tracking-label text-muted">
        {label}
        {delta && <span className="ml-2 text-green">{delta}</span>}
      </p>
      <p className="font-display text-display-md text-navy">{value}</p>
    </div>
  );
}

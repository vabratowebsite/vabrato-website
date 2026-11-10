import { formatPacificTime } from "@/lib/format";
import { MLS_LOGO_ALT, mlsDisclaimer } from "@/lib/mls-legal";

// MLS-1: MLSListings logo, disclaimer and last-updated time. Required on every
// page that shows MLS data (a guard test checks the route files). The logo is
// a text badge until MLSListings supplies the official artwork (mls-legal.ts).

export function MlsAttribution({ lastUpdated, className = "" }: { lastUpdated: string | null; className?: string }) {
  return (
    <section aria-label="MLS listing information" data-mls-attribution className={`font-body text-caption text-muted ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          role="img"
          aria-label={MLS_LOGO_ALT}
          className="inline-flex items-center border border-current px-2 py-0.5 text-[11px] font-bold uppercase tracking-label"
        >
          MLSListings
        </span>
        <span>{lastUpdated ? `Data last updated ${formatPacificTime(lastUpdated)}.` : "Data last updated: not yet available."}</span>
      </div>
      <p className="mt-2 max-w-prose">{mlsDisclaimer()}</p>
    </section>
  );
}

import { MLS_LOGO_ALT, mlsDisclaimer } from "@vabrato/lib";
import { fmtWhen } from "@/lib/today";

// MLS-1 in the console: MLSListings logo, disclaimer and last-updated time on
// pages that show MLS data (stats, CMAs, Our listings). Same text as the
// website (packages/lib/mls-legal.ts; placeholders until MLSListings sends
// the official versions).
export function MlsAttribution({ lastUpdated }: { lastUpdated: string | null }) {
  return (
    <section aria-label="MLS listing information" data-mls-attribution className="font-body text-caption text-muted">
      <div className="flex flex-wrap items-center gap-3">
        <span role="img" aria-label={MLS_LOGO_ALT} className="inline-flex items-center border border-current px-2 py-0.5 text-[11px] font-bold uppercase tracking-label">
          MLSListings
        </span>
        <span>{lastUpdated ? `Data last updated ${fmtWhen(lastUpdated)}.` : "Data last updated: not yet available."}</span>
      </div>
      <p className="mt-2 max-w-prose">{mlsDisclaimer()}</p>
    </section>
  );
}

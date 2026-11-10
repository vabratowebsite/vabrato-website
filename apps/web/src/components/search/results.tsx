import { ListingCard } from "@vabrato/ui/web";
import { toCardProps } from "@/lib/listing-view";
import type { SearchRow } from "@/lib/public/listings";
import { SavableListingCard } from "@/member/components/SaveIslands";

/** Listing cards with save hearts (vabrato.com). `savable={false}` on homes.sancarloslife.com, which has no accounts. */
export function ResultsGrid({ rows, headingLevel = "h3", savable = true }: { rows: SearchRow[]; headingLevel?: "h2" | "h3"; savable?: boolean }) {
  if (rows.length === 0) {
    return <p className="border border-line p-6 font-body text-body text-ink">No homes match these filters. Try a wider price range or more cities.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.listing_key}>
          {savable ? (
            <SavableListingCard {...toCardProps(r)} listingKey={r.listing_key} headingLevel={headingLevel} />
          ) : (
            <ListingCard {...toCardProps(r)} headingLevel={headingLevel} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** MLS-6: sold prices are for members. Nothing sold is fetched for this banner. */
export function SoldMembersBanner() {
  return (
    <div className="border border-dashed border-muted bg-navy-50 p-4 font-body text-body-sm text-ink">
      <strong>Sold prices and price history are shown to members.</strong>{" "}
      <a href="/join" className="text-navy underline">
        Create a free account
      </a>{" "}
      to see recent sales.
    </div>
  );
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (p: number) => string }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const window = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2);
  return (
    <nav aria-label="Results pages" className="flex flex-wrap items-center gap-2 font-body text-body-sm">
      {page > 1 && (
        <a href={hrefFor(page - 1)} rel="prev" className="min-h-[44px] border border-line px-4 py-2.5 text-navy">
          Previous
        </a>
      )}
      {window.map((p, i) => (
        <span key={p} className="flex items-center gap-2">
          {i > 0 && p - window[i - 1]! > 1 && <span aria-hidden="true">…</span>}
          {p === page ? (
            <span aria-current="page" className="min-h-[44px] bg-navy px-4 py-2.5 text-white">
              {p}
            </span>
          ) : (
            <a href={hrefFor(p)} className="min-h-[44px] border border-line px-4 py-2.5 text-navy">
              <span className="sr-only">Page </span>
              {p}
            </a>
          )}
        </span>
      ))}
      {page < pages && (
        <a href={hrefFor(page + 1)} rel="next" className="min-h-[44px] border border-line px-4 py-2.5 text-navy">
          Next
        </a>
      )}
    </nav>
  );
}

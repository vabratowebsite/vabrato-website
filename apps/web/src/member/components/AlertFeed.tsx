import { Pill } from "@vabrato/ui/web";
import { timeAgo, type FeedItem } from "../alerts";

// "What changed" list (mockup 05). Other brokers' listings show the listing
// broker (MLS-2); the page adds <MlsAttribution> (MLS-1).
export function AlertFeed({ items, emptyText }: { items: FeedItem[]; emptyText: string }) {
  if (items.length === 0) return <p className="font-body text-body text-ink">{emptyText}</p>;
  return (
    <ul className="divide-y divide-line font-body text-body-sm text-ink">
      {items.map((i) => (
        <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <Pill tone={i.tone} dot>
                {i.label}
              </Pill>
              {!i.seen && <span className="text-caption font-medium uppercase tracking-label text-gold-ink">New</span>}
            </p>
            <p className="text-body text-ink">
              {i.href ? (
                <a href={i.href} className="font-medium text-navy underline">
                  {i.title}
                </a>
              ) : (
                i.title
              )}
              {i.price && <> · now {i.price}</>}
            </p>
            <p className="text-caption text-muted">
              {i.search ? `Matches “${i.search}” · ` : ""}
              {timeAgo(i.at)} · from MLS
              {i.broker ? ` · Listing courtesy of ${i.broker}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

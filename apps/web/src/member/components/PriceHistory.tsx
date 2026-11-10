"use client";

import { Pill } from "@vabrato/ui/web";
import { formatPrice } from "@/lib/format";
import { usePriceHistory, type HistoryResponse } from "../hooks";

// "Price & sale history" on the listing page (mockup 03, MLS-6). The teaser
// is static dummy rows: no real history is ever in the page for people who
// can't see it (review item 2). VOW members (flag on, terms accepted) get the
// real rows from /api/my, which checks again server-side.

const DUMMY = [
  { date: "Jan 1, 2026", event: "Listed for sale", price: "$0,000,000" },
  { date: "Jan 1, 2026", event: "Price changed", price: "$0,000,000" },
  { date: "Jan 1, 2020", event: "Sold", price: "$0,000,000" },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

function label(status: string, i: number, events: HistoryResponse["events"]) {
  if (status === "Closed") return "Sold";
  if (i === 0) return "Listed for sale";
  const prev = events[i - 1]!;
  if (prev.status !== status) return status === "Active" ? "Back on the market" : status === "Pending" ? "Pending" : status === "ActiveUnderContract" ? "Under contract" : status;
  return "Price changed";
}

export function PriceHistory({ listingKey, joinHref = "/join" }: { listingKey: string; joinHref?: string }) {
  const q = usePriceHistory(listingKey);
  const result = q.data;

  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading" className="flex items-center gap-3 font-subhead text-subhead-lg text-ink">
        Price &amp; sale history <Pill tone="neutral">Members</Pill>
      </h2>
      {result?.status === "ok" ? (
        <History data={result.data} />
      ) : (
        <div className="relative mt-4 border border-line">
          <table aria-hidden="true" className="w-full select-none font-body text-body-sm text-ink blur-[3px]">
            <tbody>
              {DUMMY.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{r.event}</td>
                  <td className="px-4 py-3 text-right">{r.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 p-4 text-center font-body">
            {result?.status === "locked" && result.reason === "terms" ? (
              <>
                <p className="text-body text-ink">Accept the Terms of Use to see price changes and past sales.</p>
                <a href="/my/account" className="text-body-sm font-medium text-navy underline">
                  Go to my account
                </a>
              </>
            ) : result?.status === "locked" && result.reason === "unavailable" ? (
              <p className="text-body text-ink">Price history is coming to member accounts soon.</p>
            ) : (
              <>
                <p className="text-body text-ink">Price changes and past sales are shown to members who accept the VOW Terms of Use.</p>
                <a href={joinHref} className="text-body-sm font-medium text-navy underline">
                  Sign in free to see full history
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function History({ data }: { data: HistoryResponse }) {
  // The close itself comes from the sold detail; drop the feed's Closed status row.
  const events = data.sold ? data.events.filter((e) => e.status !== "Closed") : data.events;
  const rows = events.map((e, i) => ({ date: fmtDate(e.at), event: label(e.status, i, events), price: formatPrice(e.price) }));
  if (data.sold) rows.push({ date: fmtDate(data.sold.date), event: "Sold", price: formatPrice(data.sold.price) });
  if (rows.length === 0) return <p className="mt-4 font-body text-body-sm text-muted">No price changes recorded yet.</p>;
  return (
    <table className="mt-4 w-full border border-line font-body text-body-sm text-ink">
      <caption className="sr-only">Price and sale history</caption>
      <thead>
        <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
          <th scope="col" className="px-4 py-2 font-medium">
            Date
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            Event
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            Price
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            <td className="px-4 py-3">{r.date}</td>
            <td className="px-4 py-3">{r.event}</td>
            <td className="px-4 py-3 text-right">{r.price}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

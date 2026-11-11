import Link from "next/link";
import type { ReactNode } from "react";
import type { Deal, Profile } from "@vabrato/db";
import { computeCoe, diffDays, fmtLong, fmtShort, todayISO } from "@vabrato/lib";
import { cx, focusLight } from "@vabrato/ui/web";
import { ConsoleShell } from "./console-shell";

export type DealTab = "tasks" | "calendar" | "receipts";

const TABS: { key: DealTab; label: string; path: string }[] = [
  { key: "tasks", label: "Tasks", path: "" },
  { key: "calendar", label: "Calendar", path: "/calendar" },
  { key: "receipts", label: "Receipts", path: "/receipts" },
];

/** One deal inside the console: summary strip, tabs, then the tab's content. */
export async function DealShell({
  profile,
  deal,
  done,
  total,
  active,
  children,
}: {
  profile: Profile;
  deal: Deal;
  done: number;
  total: number;
  active: DealTab;
  children: ReactNode;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const coe = computeCoe(deal.ratification_date, deal.days_to_close);
  const daysToCoe = Math.max(0, diffDays(todayISO(), coe));
  const sub = [deal.escrow_number && `Escrow #${deal.escrow_number}`, deal.seller_name && `Seller ${deal.seller_name}`, deal.seller_type !== "normal" && deal.seller_type.replace(/_/g, " ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <ConsoleShell profile={profile} current="deals" eyebrow={sub ? `Deal · ${sub}` : "Deal"} title={deal.address}>
      <section aria-label="Deal summary" className="border border-line bg-white">
        <dl className="grid grid-cols-2 gap-4 p-5 font-body sm:grid-cols-4">
          <Stat label="Ratified" value={fmtShort(deal.ratification_date)} />
          <Stat label="Close of escrow" value={fmtLong(coe)} />
          <Stat label="Days to close" value={String(daysToCoe)} />
          <div>
            <dt className="text-label uppercase tracking-label text-muted">Progress</dt>
            <dd className="mt-1 text-body-sm text-ink">
              {done}/{total} tasks · {pct}%
              <span aria-hidden="true" className="mt-1.5 block h-2 bg-navy-50">
                <span className="block h-full bg-navy" style={{ width: `${pct}%` }} />
              </span>
            </dd>
          </div>
        </dl>
        <nav aria-label="Deal sections" className="flex gap-1 border-t border-line px-3">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={`/deals/${deal.id}${tab.path}`}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-[44px] items-center border-b-2 px-4 font-body text-body-sm font-medium",
                  isActive ? "border-navy text-navy" : "border-transparent text-muted hover:text-navy",
                  focusLight,
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </section>
      {children}
    </ConsoleShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-label text-muted">{label}</dt>
      <dd className="mt-1 text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

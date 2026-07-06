import Link from "next/link";
import type { ReactNode } from "react";
import type { Deal, Profile } from "@vabrato/db";
import { computeCoe, diffDays, fmtLong, fmtShort, todayISO } from "@vabrato/lib";
import { T } from "@vabrato/ui";
import { Header } from "@/components/header";

export type DealTab = "tasks" | "calendar" | "receipts";

const TABS: { key: DealTab; label: string; path: string }[] = [
  { key: "tasks", label: "Tasks", path: "" },
  { key: "calendar", label: "Calendar", path: "/calendar" },
  { key: "receipts", label: "Receipts", path: "/receipts" },
];

export function DealShell({
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

  return (
    <div>
      <Header profile={profile} />

      <div style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }}>
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 pt-4">
          <div>
            <div className="font-serif text-lg leading-tight">{deal.address}</div>
            <div className="mt-0.5 text-xs" style={{ color: T.muted }}>
              {deal.escrow_number ? `Escrow #${deal.escrow_number} · ` : ""}
              {deal.seller_name ? `Seller ${deal.seller_name}` : ""}
              {deal.seller_type !== "normal" && (
                <span className="ml-1" style={{ color: T.goldDeep }}>
                  · {deal.seller_type.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Stat label="Ratified" value={fmtShort(deal.ratification_date)} />
            <Stat label="Close of escrow" value={fmtLong(coe)} accent />
            <Stat label="Days to COE" value={String(daysToCoe)} />
            <div className="w-36">
              <div className="mb-1 flex justify-between text-xs" style={{ color: T.muted }}>
                <span>Progress</span>
                <span>
                  {done}/{total} · {pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: T.lineSoft }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: T.gold }}
                />
              </div>
            </div>
          </div>
        </div>

        <nav className="mt-3 flex gap-1 px-6">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={`/deals/${deal.id}${tab.path}`}
                className="rounded-t-lg px-4 py-2 text-sm font-medium"
                style={{
                  color: isActive ? T.goldDeep : T.muted,
                  borderBottom: `2px solid ${isActive ? T.gold : "transparent"}`,
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto max-w-4xl space-y-5 p-6">{children}</main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>
        {label}
      </div>
      <div className="text-sm font-medium" style={{ color: accent ? T.goldDeep : T.text }}>
        {value}
      </div>
    </div>
  );
}

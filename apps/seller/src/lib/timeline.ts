import type { Deal, DealContingency, Task } from "@vabrato/db";
import { addDays, computeCoe, contingencyTitle } from "@vabrato/lib";

export interface Milestone {
  key: string;
  label: string;
  date: string;
  complete: boolean;
}

export interface SellerTimeline {
  coe: string;
  milestones: Milestone[];
  /** Index of the first incomplete milestone, or -1 when everything is done. */
  nextIndex: number;
}

/**
 * Client-facing milestone view of a deal. "Complete" is presented gently: a
 * milestone counts as complete when its flag says so (removed/done/closed) or
 * its date has passed — sellers see progress, not internal overdue states.
 */
export function buildTimeline(
  deal: Pick<
    Deal,
    "ratification_date" | "days_to_close" | "rent_back_days" | "status"
  >,
  contingencies: Pick<DealContingency, "kind" | "due_date" | "removed_at">[],
  sellerTasks: Pick<Task, "title" | "due_date" | "done" | "owner">[],
  today: string,
): SellerTimeline {
  const coe = computeCoe(deal.ratification_date, deal.days_to_close);

  const milestones: Milestone[] = [
    {
      key: "ratified",
      label: "Contract ratified",
      date: deal.ratification_date,
      complete: deal.ratification_date <= today,
    },
  ];

  for (const c of contingencies) {
    if (!c.due_date) continue;
    milestones.push({
      key: `contingency:${c.kind}`,
      label: contingencyTitle(c.kind),
      date: c.due_date,
      complete: c.removed_at !== null || c.due_date < today,
    });
  }

  const signing = sellerTasks.find((t) => t.owner === "Seller");
  if (signing) {
    milestones.push({
      key: "signing",
      label: "You sign closing documents",
      date: signing.due_date,
      complete: signing.done || signing.due_date < today,
    });
  }

  milestones.push({
    key: "coe",
    label: "Close of escrow",
    date: coe,
    complete: deal.status === "closed" || coe < today,
  });

  if (deal.rent_back_days > 0) {
    const rentBackEnd = addDays(coe, deal.rent_back_days);
    milestones.push({
      key: "rent_back_end",
      label: `Rent-back ends (${deal.rent_back_days} days)`,
      date: rentBackEnd,
      complete: rentBackEnd < today,
    });
  }

  milestones.sort((a, b) => a.date.localeCompare(b.date));
  return { coe, milestones, nextIndex: milestones.findIndex((m) => !m.complete) };
}

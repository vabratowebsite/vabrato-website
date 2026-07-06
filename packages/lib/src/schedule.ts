// The schedule engine (CLAUDE.md "the core"). Pure and deterministic — no
// clock, no I/O — so every date is unit-testable.
//
// Task templates are ported from prototypes/va/vabrato_va_dashboard.jsx with
// one generalization: the prototype hardcoded closing-week/after-COE offsets
// assuming a 15-day close. Here those templates anchor to COE with a delta
// (prototype offset − 15), so a 30- or 45-day escrow keeps "closing week"
// tasks in the actual closing week. For daysToClose = 15 the output matches
// the prototype exactly. `offsetDays` in the output is always expressed as
// days from ratification (pre-roll), per the spec.

import type { SellerType, TaskPhase } from "@vabrato/db";
import { addDays, assertISODate, diffDays, rollForward } from "./holidays";

export type TaskOwner =
  | "VA"
  | "Lead Agent"
  | "Mark"
  | "Viv"
  | "TC"
  | "Local Help"
  | "Rachee/Ced"
  | "LA"
  | "Seller";

export interface ContingencySpec {
  kind: string;
  offsetDays: number;
}

export interface ScheduleInput {
  /** ISO yyyy-mm-dd. */
  ratificationDate: string;
  /** Calendar days from ratification to close of escrow. Default 15. */
  daysToClose?: number;
  /**
   * Contingency removals. Omit for the standard four (insurance +7,
   * financing +7, appraisal +8, property condition +8); pass [] for an
   * all-cash / no-contingency deal; pass a list to override offsets or kinds.
   */
  contingencies?: ContingencySpec[];
  sellerType?: SellerType;
  /** Seller rent-back after COE, in calendar days. Default 0. */
  rentBackDays?: number;
}

export interface ScheduledTask {
  title: string;
  owner: TaskOwner;
  phase: TaskPhase;
  /** Intended calendar days from ratification, before weekend/holiday roll. */
  offsetDays: number;
  /** Business day (never weekend / US federal holiday). */
  dueDate: string;
}

export interface ScheduledNotification {
  templateKey: string;
  audience: "seller";
  sendDate: string;
}

export interface Schedule {
  tasks: ScheduledTask[];
  timeline: {
    ratification: string;
    coe: string;
    contingencyRemovals: { kind: string; dueDate: string }[];
    /** Calendar end of rent-back (contract date, not rolled); null if none. */
    rentBackEnd: string | null;
  };
  notifications: ScheduledNotification[];
}

type Anchor = "ratification" | "coe";

interface Template {
  title: string;
  owner: TaskOwner;
  phase: TaskPhase;
  anchor: Anchor;
  offset: number;
}

const t = (
  title: string,
  owner: TaskOwner,
  phase: TaskPhase,
  anchor: Anchor,
  offset: number,
): Template => ({ title, owner, phase, anchor, offset });

const BASE_TEMPLATES: Template[] = [
  // Phase 1 — after ratification (anchored to ratification)
  t("Verify COE isn't a holiday or weekend", "VA", "after_ratification", "ratification", 0),
  t("Verify sellers are available to sign closing docs", "VA", "after_ratification", "ratification", 1),
  t("Add 'Sale Pending' rider to sign post", "Local Help", "after_ratification", "ratification", 1),
  t("Change property website to 'Under Contract'", "Rachee/Ced", "after_ratification", "ratification", 1),
  t("Change MLS status to Pending", "Lead Agent", "after_ratification", "ratification", 1),
  t("Fill Info tab; input buyer & buyer's-agent details", "VA", "after_ratification", "ratification", 1),
  t("Send escrow the seller info & signed contract", "VA", "after_ratification", "ratification", 1),
  t("Complete & deliver the Escrow Guide to the seller", "VA", "after_ratification", "ratification", 2),
  t("Verify earnest-money deposit (EMD) is in escrow", "Lead Agent", "after_ratification", "ratification", 3),
  t("Verify smoke/CO detectors + water heater strapped", "Local Help", "after_ratification", "ratification", 4),
  t("Order home warranty", "VA", "after_ratification", "ratification", 5),
  t("Ask escrow for the estimated closing statement", "VA", "after_ratification", "ratification", 5),
  t("Create commission demand", "VA", "after_ratification", "ratification", 6),
  t("Create reimbursement demand for Mark to review", "VA", "after_ratification", "ratification", 6),
  t("Schedule de-staging (after contingencies + appraisal)", "VA", "after_ratification", "ratification", 9),
  // Phase 2 — closing week (anchored to COE; delta = prototype offset − 15)
  t("Confirm escrow has coordinated seller signing", "VA", "closing_week", "coe", -5),
  t("Send commission demand to escrow", "Lead Agent", "closing_week", "coe", -5),
  t("Notify utility companies to cancel effective COE", "VA", "closing_week", "coe", -4),
  t("Remind seller: wire vs check, don't unplug left-behind fridge, forward mail", "VA", "closing_week", "coe", -4),
  t("Seller signs closing documents (window opens)", "Seller", "closing_week", "coe", -4),
  t("Buyers' final walk-through", "VA", "closing_week", "coe", -3),
  t("Remove signs/lockbox; retrieve keys & remotes", "Local Help", "closing_week", "coe", -1),
  t("Close of Escrow (COE)", "Mark", "closing_week", "coe", 0),
  t("Give keys to buyer's agent", "Local Help", "closing_week", "coe", 0),
  t("Change MLS status to Sold", "Lead Agent", "closing_week", "coe", 0),
  t("Remind seller to cancel home insurance", "VA", "closing_week", "coe", 0),
  // Phase 3 — after COE
  t("Send seller thank-you note & gift", "LA", "after_coe", "coe", 1),
  t("Send buyer's agent thank-you note & gift", "Local Help", "after_coe", "coe", 1),
  t("Add client to referral base", "LA", "after_coe", "coe", 1),
  t("Update sale info on Vabrato website", "Rachee/Ced", "after_coe", "coe", 1),
  t("Verify TC got paid", "Mark", "after_coe", "coe", 1),
  t("Verify we got paid", "Mark", "after_coe", "coe", 1),
  t("Obtain final closing statement", "TC", "after_coe", "coe", 2),
  t("Dump transaction emails into cloud folder", "Viv", "after_coe", "coe", 3),
];

const TRUST_TEMPLATES: Template[] = [
  t("Confirm estate/trust bank account for proceeds", "VA", "after_ratification", "ratification", 3),
  t("Provide escrow Letters Testamentary / trust certificate", "VA", "after_ratification", "ratification", 3),
  t("Address supplemental taxes (probate / successor trustee)", "Mark", "after_ratification", "ratification", 8),
];

export const DEFAULT_CONTINGENCIES: ContingencySpec[] = [
  { kind: "insurance", offsetDays: 7 },
  { kind: "financing", offsetDays: 7 },
  { kind: "appraisal", offsetDays: 8 },
  { kind: "property_condition", offsetDays: 8 },
];

const CONTINGENCY_TITLES: Record<string, string> = {
  insurance: "Insurance contingency removal",
  financing: "Financing contingency removal",
  appraisal: "Appraisal contingency removal",
  property_condition: "Property-condition contingency removal",
};

function contingencyTitle(kind: string): string {
  return CONTINGENCY_TITLES[kind] ?? `${kind.replace(/_/g, " ")} contingency removal`;
}

// Seller-facing scheduled sends. Static template keys only — bodies live in
// the email layer (CLAUDE.md: no runtime AI, no generated copy).
const NOTIFICATION_TEMPLATES: { templateKey: string; anchor: Anchor; offset: number }[] = [
  { templateKey: "seller_welcome", anchor: "ratification", offset: 1 },
  { templateKey: "seller_signing_reminder", anchor: "coe", offset: -4 },
  { templateKey: "seller_closing_tomorrow", anchor: "coe", offset: -1 },
  { templateKey: "seller_post_coe_checklist", anchor: "coe", offset: 1 },
];

export function computeCoe(ratificationDate: string, daysToClose: number): string {
  return rollForward(addDays(ratificationDate, daysToClose));
}

export function generateSchedule(input: ScheduleInput): Schedule {
  const {
    ratificationDate,
    daysToClose = 15,
    contingencies = DEFAULT_CONTINGENCIES,
    sellerType = "normal",
    rentBackDays = 0,
  } = input;

  assertISODate(ratificationDate);
  if (!Number.isInteger(daysToClose) || daysToClose < 1) {
    throw new Error(`daysToClose must be a positive integer, got ${daysToClose}`);
  }
  if (!Number.isInteger(rentBackDays) || rentBackDays < 0) {
    throw new Error(`rentBackDays must be a non-negative integer, got ${rentBackDays}`);
  }
  for (const c of contingencies) {
    if (!Number.isInteger(c.offsetDays) || c.offsetDays < 0) {
      throw new Error(`contingency ${c.kind}: offsetDays must be a non-negative integer`);
    }
  }

  const coe = computeCoe(ratificationDate, daysToClose);
  const coeOffset = diffDays(ratificationDate, coe);

  const offsetFrom = (anchor: Anchor, offset: number): number =>
    anchor === "ratification" ? offset : coeOffset + offset;

  const templates: Template[] = [
    ...BASE_TEMPLATES,
    ...contingencies.map((c) =>
      t(contingencyTitle(c.kind), "TC", "after_ratification", "ratification", c.offsetDays),
    ),
    ...(sellerType === "normal" ? [] : TRUST_TEMPLATES),
  ];

  const tasks: ScheduledTask[] = templates
    .map((tpl) => {
      const offsetDays = offsetFrom(tpl.anchor, tpl.offset);
      return {
        title: tpl.title,
        owner: tpl.owner,
        phase: tpl.phase,
        offsetDays,
        dueDate: rollForward(addDays(ratificationDate, offsetDays)),
      };
    })
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.offsetDays - b.offsetDays ||
        a.title.localeCompare(b.title),
    );

  const rentBackEnd = rentBackDays > 0 ? addDays(coe, rentBackDays) : null;
  if (rentBackEnd) {
    const dueDate = rollForward(rentBackEnd);
    tasks.push({
      title: "Rent-back ends — retrieve keys & confirm move-out",
      owner: "Local Help",
      phase: "after_coe",
      offsetDays: diffDays(ratificationDate, rentBackEnd),
      dueDate,
    });
    tasks.sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.offsetDays - b.offsetDays ||
        a.title.localeCompare(b.title),
    );
  }

  const contingencyRemovals = contingencies.map((c) => ({
    kind: c.kind,
    dueDate: rollForward(addDays(ratificationDate, c.offsetDays)),
  }));

  const notifications: ScheduledNotification[] = NOTIFICATION_TEMPLATES.map((n) => ({
    templateKey: n.templateKey,
    audience: "seller" as const,
    sendDate: rollForward(addDays(ratificationDate, offsetFrom(n.anchor, n.offset))),
  }));
  if (rentBackEnd) {
    notifications.push({
      templateKey: "seller_rent_back_ending",
      audience: "seller",
      sendDate: rollForward(addDays(rentBackEnd, -2)),
    });
  }
  notifications.sort(
    (a, b) => a.sendDate.localeCompare(b.sendDate) || a.templateKey.localeCompare(b.templateKey),
  );

  return {
    tasks,
    timeline: { ratification: ratificationDate, coe, contingencyRemovals, rentBackEnd },
    notifications,
  };
}

// Seller notification pipeline. Bodies are STATIC templates with merge
// fields only — no runtime AI, per CLAUDE.md. The processor is dependency-
// injected so it unit-tests without Supabase or Resend.

import { renderAlertEmail } from "./alert-emails";
import { isStaffTemplate, renderStaffEmail } from "./staff-emails";
import type { Schedule } from "./schedule";

export type MergeFields = Record<string, string>;

export interface RenderedEmail {
  subject: string;
  body: string;
  /** Extra mail headers, e.g. List-Unsubscribe on alert emails. */
  headers?: Record<string, string>;
}

export interface RenderContext {
  /** Public site origin for links in emails. */
  siteUrl: string;
  /** Agent console origin for staff alerts (default https://console.vabrato.com). */
  consoleUrl?: string;
}

/** Buyer alert emails: skipped (cancelled) if the member has since opted out. */
export const ALERT_TEMPLATE_KEYS = ["buyer_alert_instant", "buyer_alert_digest"] as const;
export const isAlertTemplate = (key: string) => (ALERT_TEMPLATE_KEYS as readonly string[]).includes(key);

const WIRING_SAFETY =
  "Security reminder: Vabrato and escrow will NEVER email you wiring instructions. " +
  "Always call your escrow officer directly to verify wiring details before moving any money.";

const signoff = "\n\n— The Vabrato Team";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 2–8, 2026" or "Oct 26 – Nov 1, 2026" from two YYYY-MM-DD dates. */
export function weekLabel(start: string, end: string): string {
  const [ys, ms, ds] = start.split("-").map(Number) as [number, number, number];
  const [ye, me, de] = end.split("-").map(Number) as [number, number, number];
  if (!ys || !ye) return `${start} – ${end}`;
  if (ys !== ye) return `${MONTHS[ms - 1]} ${ds}, ${ys} – ${MONTHS[me - 1]} ${de}, ${ye}`;
  if (ms === me) return `${MONTHS[ms - 1]} ${ds}–${de}, ${ys}`;
  return `${MONTHS[ms - 1]} ${ds} – ${MONTHS[me - 1]} ${de}, ${ys}`;
}

const STATUS_LABEL: Record<string, string> = { Active: "Active", ActiveUnderContract: "In contract", Pending: "Pending", Closed: "Sold" };
const count = (v: string | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n).toLocaleString("en-US") : "0";
};
const plural = (v: string | undefined, one: string, many: string) => `${count(v)} ${Number(v) === 1 ? one : many}`;

const TEMPLATES: Record<string, (m: MergeFields, ctx: RenderContext) => RenderedEmail> = {
  // Seller weekly report (S6 PR 5): the counts from the seller's listing
  // performance page for one finished week. Reviewed and sent by staff.
  seller_weekly_report: (m, ctx) => {
    const price = Number(m.listPrice);
    const listing = [STATUS_LABEL[m.status ?? ""] ?? "", Number.isFinite(price) && price > 0 ? `listed at $${Math.round(price).toLocaleString("en-US")}` : ""].filter(Boolean).join(", ");
    return {
      subject: `Your listing this week: ${m.address} (${weekLabel(m.weekStart ?? "", m.weekEnd ?? "")})`,
      body:
        `Hi${m.sellerName ? ` ${m.sellerName}` : ""},\n\n` +
        `Here's how ${m.address} did on vabrato.com from ${weekLabel(m.weekStart ?? "", m.weekEnd ?? "")}${listing ? ` (${listing})` : ""}:\n\n` +
        `- ${plural(m.views, "view", "views")} of the listing page\n` +
        `- ${plural(m.saves, "new save", "new saves")} by home buyers\n` +
        `- ${plural(m.tourRequests, "tour request", "tour requests")}\n` +
        `- ${plural(m.openHouseSignins, "open-house sign-in", "open-house sign-ins")}\n\n` +
        `Since it was listed: ${plural(m.totalViews, "view", "views")}, ${plural(m.totalSaves, "save", "saves")}, ` +
        `${plural(m.totalTourRequests, "tour request", "tour requests")} and ${plural(m.totalOpenHouseSignins, "open-house sign-in", "open-house sign-ins")}.\n\n` +
        `These count activity on our website only, not other sites or the MLS. See the week-by-week chart any time at ` +
        `${ctx.siteUrl}/my/seller/performance (sign in with this email address). Questions? Send your agent a message from your portal.` +
        signoff,
    };
  },
  seller_welcome: (m, ctx) => ({
    subject: `Your sale is underway — ${m.address}`,
    body:
      `Hi${m.sellerName ? ` ${m.sellerName}` : ""},\n\n` +
      `Congratulations — your contract for ${m.address} is ratified. ` +
      `Closing is currently set for ${m.coe}.\n\n` +
      `We'll keep everything on track and send you a reminder before each step that needs you. ` +
      `You can follow your sale timeline, to-dos and listing activity any time at ` +
      `${ctx.siteUrl}/my/seller. Sign in with this email address.\n\n` +
      WIRING_SAFETY +
      signoff,
  }),
  seller_signing_reminder: (m) => ({
    subject: `Closing-document signing is coming up — ${m.address}`,
    body:
      `Hi${m.sellerName ? ` ${m.sellerName}` : ""},\n\n` +
      `Your signing window for ${m.address} opens in the next few days ahead of your ` +
      `${m.coe} closing. The escrow office will reach out to schedule your appointment — ` +
      `please bring a government-issued photo ID.\n\n` +
      WIRING_SAFETY +
      signoff,
  }),
  seller_closing_tomorrow: (m) => ({
    subject: `You close tomorrow — ${m.address}`,
    body:
      `Hi${m.sellerName ? ` ${m.sellerName}` : ""},\n\n` +
      `Tomorrow is closing day for ${m.address} (${m.coe}). Nothing more is needed from you ` +
      `unless escrow reaches out. Reminders: don't unplug an included fridge, leave keys and ` +
      `remotes as arranged, and set up mail forwarding if you haven't.\n\n` +
      WIRING_SAFETY +
      signoff,
  }),
  seller_post_coe_checklist: (m) => ({
    subject: `You're closed! A few loose ends — ${m.address}`,
    body:
      `Hi${m.sellerName ? ` ${m.sellerName}` : ""},\n\n` +
      `${m.address} has officially closed — congratulations!\n\n` +
      `A short checklist:\n` +
      `- Cancel your homeowner's insurance (effective after closing)\n` +
      `- Confirm your mail forwarding with USPS\n` +
      `- Keep your final closing statement for tax season\n\n` +
      `Thank you for selling with Vabrato.` +
      signoff,
  }),
  seller_rent_back_ending: (m) => ({
    subject: `Your rent-back is ending soon — ${m.address}`,
    body:
      `Hi${m.sellerName ? ` ${m.sellerName}` : ""},\n\n` +
      `A reminder that your rent-back period at ${m.address} ends on ${m.rentBackEnd}. ` +
      `Please arrange your move-out and key handoff by then.` +
      signoff,
  }),
};

const ALERT_TEMPLATES: Record<string, (payload: unknown, ctx: RenderContext) => RenderedEmail> = {
  buyer_alert_instant: (p, ctx) => renderAlertEmail("instant", p, ctx),
  buyer_alert_digest: (p, ctx) => renderAlertEmail("digest", p, ctx),
};

export function renderNotification(templateKey: string, payload: unknown, ctx: RenderContext = { siteUrl: "https://vabrato.com" }): RenderedEmail {
  const alert = ALERT_TEMPLATES[templateKey];
  if (alert) return alert(payload, ctx);
  if (isStaffTemplate(templateKey)) return renderStaffEmail(templateKey, payload, { siteUrl: ctx.siteUrl, consoleUrl: ctx.consoleUrl ?? "https://console.vabrato.com" });
  const template = TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown notification template: ${templateKey}`);
  return template((payload ?? {}) as MergeFields, ctx);
}

/** Seller (deal) templates; buyer alert templates are ALERT_TEMPLATE_KEYS. */
export const NOTIFICATION_TEMPLATE_KEYS = Object.keys(TEMPLATES);

/**
 * Maps a generated schedule to notifications-table rows for one recipient.
 * Past send dates are dropped (a seller invited mid-escrow only gets what's
 * still ahead). Sends go out at 16:00 UTC (~9am Pacific).
 */
export function buildSellerNotificationRows(
  schedule: Schedule,
  merge: MergeFields,
  fromDate: string,
): { template_key: string; send_at: string; payload: MergeFields }[] {
  return schedule.notifications
    .filter((n) => n.sendDate >= fromDate)
    .map((n) => ({
      template_key: n.templateKey,
      send_at: `${n.sendDate}T16:00:00.000Z`,
      payload: merge,
    }));
}

// ---------------------------------------------------------------------------
// Processor

export interface DueNotification {
  id: string;
  template_key: string;
  payload: unknown;
  recipientEmail: string | null;
  /** The recipient has turned alert emails off (checked again at send time). */
  alertsOptedOut?: boolean;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
  headers?: Record<string, string>;
  /** Sent to Resend as Idempotency-Key (the notification id): a repeat send is dropped. */
  idempotencyKey?: string;
}

export interface NotificationDeps {
  fetchDue(): Promise<DueNotification[]>;
  send(email: OutboundEmail): Promise<{ error: string | null }>;
  markSent(id: string): Promise<void>;
  /**
   * `permanent`: no recipient, unknown template or bad payload: retrying won't
   * help. Otherwise (a send error) the store may retry later (0022 backoff).
   */
  markFailed(id: string, reason: string, permanent?: boolean): Promise<void>;
  markCancelled?(id: string, reason: string): Promise<void>;
  /** Site origin for links in emails (default https://vabrato.com). */
  siteUrl?: string;
  /** Console origin for links in staff alerts (default https://console.vabrato.com). */
  consoleUrl?: string;
}

export interface ProcessResult {
  sent: number;
  failed: number;
  cancelled?: number;
}

export async function processDueNotifications(deps: NotificationDeps): Promise<ProcessResult> {
  const due = await deps.fetchDue();
  let sent = 0;
  let failed = 0;
  let cancelled = 0;
  const ctx: RenderContext = {
    siteUrl: (deps.siteUrl ?? "https://vabrato.com").replace(/\/+$/, ""),
    consoleUrl: (deps.consoleUrl ?? "https://console.vabrato.com").replace(/\/+$/, ""),
  };

  for (const n of due) {
    if (isAlertTemplate(n.template_key) && n.alertsOptedOut) {
      if (deps.markCancelled) await deps.markCancelled(n.id, "recipient turned alert emails off");
      else await deps.markFailed(n.id, "recipient turned alert emails off");
      cancelled++;
      continue;
    }
    if (!n.recipientEmail) {
      await deps.markFailed(n.id, "no recipient email", true);
      failed++;
      continue;
    }
    let rendered: RenderedEmail;
    try {
      rendered = renderNotification(n.template_key, n.payload, ctx);
    } catch (e) {
      await deps.markFailed(n.id, (e as Error).message.slice(0, 500), true);
      failed++;
      continue;
    }
    const { error } = await deps.send({
      to: n.recipientEmail,
      subject: rendered.subject,
      body: rendered.body,
      idempotencyKey: n.id,
      ...(rendered.headers ? { headers: rendered.headers } : {}),
    });
    if (error) {
      await deps.markFailed(n.id, error, false);
      failed++;
    } else {
      await deps.markSent(n.id);
      sent++;
    }
  }

  return cancelled ? { sent, failed, cancelled } : { sent, failed };
}

/**
 * Minimal Resend sender (REST, no SDK). `from` must be a verified domain.
 * `baseUrl` points at a fake Resend in local QA; `doFetch` is for tests.
 */
export function resendSender(apiKey: string, from: string, opts: { baseUrl?: string; doFetch?: typeof fetch } = {}) {
  const url = `${(opts.baseUrl ?? "https://api.resend.com").replace(/\/+$/, "")}/emails`;
  const doFetch = opts.doFetch ?? fetch;
  return async (email: OutboundEmail): Promise<{ error: string | null }> => {
    const res = await doFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.body, ...(email.headers ? { headers: email.headers } : {}) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { error: null };
  };
}

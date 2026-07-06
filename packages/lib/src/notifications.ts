// Seller notification pipeline. Bodies are STATIC templates with merge
// fields only — no runtime AI, per CLAUDE.md. The processor is dependency-
// injected so it unit-tests without Supabase or Resend.

import type { Schedule } from "./schedule";

export type MergeFields = Record<string, string>;

export interface RenderedEmail {
  subject: string;
  body: string;
}

const WIRING_SAFETY =
  "Security reminder: Vabrato and escrow will NEVER email you wiring instructions. " +
  "Always call your escrow officer directly to verify wiring details before moving any money.";

const signoff = "\n\n— The Vabrato Team";

const TEMPLATES: Record<string, (m: MergeFields) => RenderedEmail> = {
  seller_welcome: (m) => ({
    subject: `Your sale is underway — ${m.address}`,
    body:
      `Hi${m.sellerName ? ` ${m.sellerName}` : ""},\n\n` +
      `Congratulations — your contract for ${m.address} is ratified. ` +
      `Closing is currently set for ${m.coe}.\n\n` +
      `We'll keep everything on track and send you a reminder before each step that needs you. ` +
      `You can follow your sale timeline any time in your Vabrato seller portal.\n\n` +
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

export function renderNotification(templateKey: string, merge: MergeFields): RenderedEmail {
  const template = TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown notification template: ${templateKey}`);
  return template(merge);
}

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
  payload: MergeFields;
  recipientEmail: string | null;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
}

export interface NotificationDeps {
  fetchDue(): Promise<DueNotification[]>;
  send(email: OutboundEmail): Promise<{ error: string | null }>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
}

export interface ProcessResult {
  sent: number;
  failed: number;
}

export async function processDueNotifications(deps: NotificationDeps): Promise<ProcessResult> {
  const due = await deps.fetchDue();
  let sent = 0;
  let failed = 0;

  for (const n of due) {
    if (!n.recipientEmail) {
      await deps.markFailed(n.id, "no recipient email");
      failed++;
      continue;
    }
    let rendered: RenderedEmail;
    try {
      rendered = renderNotification(n.template_key, n.payload);
    } catch (e) {
      await deps.markFailed(n.id, (e as Error).message);
      failed++;
      continue;
    }
    const { error } = await deps.send({
      to: n.recipientEmail,
      subject: rendered.subject,
      body: rendered.body,
    });
    if (error) {
      await deps.markFailed(n.id, error);
      failed++;
    } else {
      await deps.markSent(n.id);
      sent++;
    }
  }

  return { sent, failed };
}

/** Minimal Resend sender (REST, no SDK). `from` must be a verified domain. */
export function resendSender(apiKey: string, from: string) {
  return async (email: OutboundEmail): Promise<{ error: string | null }> => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.body }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { error: null };
  };
}

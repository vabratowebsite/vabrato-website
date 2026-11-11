// Staff and member notice emails (S6 PR 2a). STATIC templates with merge
// fields only (CLAUDE.md: automatic client notifications use static
// templates; no AI). Payloads come from the database triggers in 0022 and
// carry a first name at most: no email addresses, phone numbers or message
// text. Details stay behind sign-in in the console or the portal.

import { z } from "zod";
import { VABRATO_POSTAL_ADDRESS } from "./mls-legal";

export interface StaffEmailContext {
  /** Public site origin, e.g. https://vabrato.com */
  siteUrl: string;
  /** Agent console origin, e.g. https://console.vabrato.com */
  consoleUrl: string;
}

export interface StaffEmail {
  subject: string;
  body: string;
}

const uuid = z.string().uuid();
const name = z.string().trim().max(60).optional().default("");
const label = z.string().trim().max(60).optional().default("request");
const site = z.enum(["vabrato", "sancarloslife"]).optional().default("vabrato");

const LeadPayload = z.object({ leadId: uuid, kind: label, firstName: name, site });
const DigestPayload = z.object({ count: z.coerce.number().int().min(1).max(100000) });
const MessagePayload = z.object({ memberId: uuid, firstName: name });
const SyncPayload = z.object({ lastSuccess: z.string().max(60).optional().default("unknown") });

const SITE_LABEL = { vabrato: "vabrato.com", sancarloslife: "homes.sancarloslife.com" } as const;
const WIRING =
  "Security reminder: Vabrato and escrow will NEVER email you wiring instructions. " +
  "Always call your escrow officer directly to verify wiring details before moving any money.";
const staffSignoff = "\n\n— Vabrato agent console\nThis alert has no client details. Sign in to see them.";
const who = (first: string) => first || "a client";

const TEMPLATES = {
  staff_new_lead: (p: unknown, c: StaffEmailContext): StaffEmail => {
    const d = LeadPayload.parse(p);
    return {
      subject: `New ${d.kind} from ${who(d.firstName)}`,
      body: `A new ${d.kind} from ${who(d.firstName)} came in on ${SITE_LABEL[d.site]}.\n\nOpen it in the console: ${c.consoleUrl}/leads/${d.leadId}${staffSignoff}`,
    };
  },
  staff_lead_digest: (p: unknown, c: StaffEmailContext): StaffEmail => {
    const d = DigestPayload.parse(p);
    return {
      subject: `${d.count} more new lead${d.count === 1 ? "" : "s"} in the last 15 minutes`,
      body: `${d.count} more lead${d.count === 1 ? "" : "s"} came in. Lead emails are grouped while there are more than usual in an hour.\n\nSee them in the console: ${c.consoleUrl}/leads${staffSignoff}`,
    };
  },
  staff_lead_reassigned: (p: unknown, c: StaffEmailContext): StaffEmail => {
    const d = LeadPayload.parse(p);
    return {
      subject: `Lead reassigned to you: ${d.kind} from ${who(d.firstName)}`,
      body: `A ${d.kind} from ${who(d.firstName)} is now yours.\n\nOpen it in the console: ${c.consoleUrl}/leads/${d.leadId}${staffSignoff}`,
    };
  },
  staff_lead_escalated: (p: unknown, c: StaffEmailContext): StaffEmail => {
    const d = LeadPayload.parse(p);
    return {
      subject: `No reply yet: ${d.kind} from ${who(d.firstName)}`,
      body: `Nobody has replied to a ${d.kind} from ${who(d.firstName)} yet, so it's been escalated to you.\n\nOpen it in the console: ${c.consoleUrl}/leads/${d.leadId}${staffSignoff}`,
    };
  },
  staff_new_message: (p: unknown, c: StaffEmailContext): StaffEmail => {
    const d = MessagePayload.parse(p);
    return {
      subject: `New message from ${who(d.firstName)}`,
      body: `${who(d.firstName)} sent you a message in their Vabrato portal.\n\nRead and reply in the console: ${c.consoleUrl}/messages/${d.memberId}${staffSignoff}`,
    };
  },
  staff_sync_alert: (p: unknown, c: StaffEmailContext): StaffEmail => {
    const d = SyncPayload.parse(p);
    return {
      subject: "MLS sync needs attention",
      body: `The MLS sync is failing or late. Last successful run: ${d.lastSuccess}.\n\nCheck the MLS sync page: ${c.consoleUrl}/mls${staffSignoff}`,
    };
  },
  staff_sync_recovered: (p: unknown, c: StaffEmailContext): StaffEmail => {
    const d = SyncPayload.parse(p);
    return {
      subject: "MLS sync is back to normal",
      body: `The MLS sync is running again. Last successful run: ${d.lastSuccess}.\n\nDetails: ${c.consoleUrl}/mls${staffSignoff}`,
    };
  },
  member_new_message: (_p: unknown, c: StaffEmailContext): StaffEmail => ({
    subject: "You have a new message from your Vabrato team",
    body:
      `Your Vabrato team sent you a message.\n\nRead it in your portal: ${c.siteUrl}/my/messages\n\n` +
      `${WIRING}\n\n— The Vabrato Team\n${VABRATO_POSTAL_ADDRESS}`,
  }),
} as const;

export type StaffTemplateKey = keyof typeof TEMPLATES;
export const STAFF_TEMPLATE_KEYS = Object.keys(TEMPLATES) as StaffTemplateKey[];
export const isStaffTemplate = (key: string): key is StaffTemplateKey => key in TEMPLATES;

export function renderStaffEmail(key: StaffTemplateKey, payload: unknown, ctx: StaffEmailContext): StaffEmail {
  return TEMPLATES[key](payload, ctx);
}

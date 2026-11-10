// Buyer alert emails (S5 PR 3). STATIC templates with merge fields only: no
// AI, per CLAUDE.md. The payload is built by run_member_alerts() (0018) from
// IDX fields: new list price only, never a previous or sold price (review
// item 3); hidden addresses already withheld. Every email carries the MLS
// disclaimer and listing broker (MLS-1/MLS-2), Vabrato's postal address, and
// a one-click unsubscribe (review item 15).

import { z } from "zod";
import { mlsDisclaimer, VABRATO_POSTAL_ADDRESS } from "./mls-legal";

const Item = z.object({
  title: z.string(),
  city: z.string().nullable().optional(),
  price: z.coerce.number().nullable().optional(),
  kind: z.enum(["new_match", "back_on_market", "price_drop", "price_change", "status_change"]),
  status: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
  path: z.string().regex(/^\/listing\/[A-Za-z0-9._-]{1,64}$/),
  broker: z.string().nullable().optional(),
});

export const AlertPayload = z.object({
  first_name: z.string().optional().default(""),
  items: z.array(Item).min(1),
  more: z.coerce.number().int().min(0).optional().default(0),
  unsubscribe_token: z.string().uuid(),
});
export type AlertPayload = z.infer<typeof AlertPayload>;

export interface AlertEmail {
  subject: string;
  body: string;
  headers: Record<string, string>;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const STATUS: Record<string, string> = { Active: "back to active", Pending: "now pending", ActiveUnderContract: "now under contract" };

function itemLine(i: z.infer<typeof Item>): string {
  const price = typeof i.price === "number" ? usd.format(i.price) : "";
  const where = i.city && !i.title.includes(i.city) ? `, ${i.city}` : "";
  switch (i.kind) {
    case "new_match":
      return `New listing${i.search ? ` for "${i.search}"` : ""}: ${i.title}${where}${price ? ` · ${price}` : ""}`;
    case "back_on_market":
      return `Back on the market: ${i.title}${where}${price ? ` · ${price}` : ""}`;
    case "price_drop":
      return `Price reduced: ${i.title}${where}${price ? ` · now ${price}` : ""}`;
    case "price_change":
      return `Price changed: ${i.title}${where}${price ? ` · now ${price}` : ""}`;
    case "status_change":
      return `Status update: ${i.title}${where} is ${STATUS[i.status ?? ""] ?? "updated"}`;
  }
}

export const unsubscribeUrls = (siteUrl: string, token: string) => ({
  page: `${siteUrl}/alerts/unsubscribe?t=${encodeURIComponent(token)}`,
  oneClick: `${siteUrl}/api/alerts/unsubscribe?t=${encodeURIComponent(token)}`,
});

export function renderAlertEmail(kind: "instant" | "digest", raw: unknown, opts: { siteUrl: string; year?: number }): AlertEmail {
  const p = AlertPayload.parse(raw);
  const site = opts.siteUrl.replace(/\/+$/, "");
  const count = p.items.length + p.more;
  const subject =
    kind === "digest"
      ? `Your daily home digest: ${count} ${count === 1 ? "update" : "updates"}`
      : count === 1
        ? itemLine(p.items[0]!).split(":")[0]! + `: ${p.items[0]!.title}`
        : `${count} updates on homes you're following`;
  const urls = unsubscribeUrls(site, p.unsubscribe_token);

  const lines: string[] = [];
  lines.push(`Hi${p.first_name ? ` ${p.first_name}` : ""},`, "");
  lines.push(kind === "digest" ? "Here's what changed today for your saved searches:" : "Here's what changed for homes you're following:", "");
  for (const i of p.items) {
    lines.push(`• ${itemLine(i)}`);
    lines.push(`  ${site}${i.path}`);
    if (i.broker) lines.push(`  Listing courtesy of ${i.broker}`);
  }
  if (p.more > 0) lines.push("", `…and ${p.more} more in your portal: ${site}/my/alerts`);
  lines.push("", `See everything in your portal: ${site}/my/alerts`, `Change alert settings: ${site}/my/searches`);
  lines.push("", "— The Vabrato Team", "", mlsDisclaimer(opts.year), "", VABRATO_POSTAL_ADDRESS);
  lines.push("You're getting this because you turned on alert emails in your Vabrato account.", `Unsubscribe: ${urls.page}`);

  return {
    subject,
    body: lines.join("\n"),
    headers: {
      "List-Unsubscribe": `<${urls.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

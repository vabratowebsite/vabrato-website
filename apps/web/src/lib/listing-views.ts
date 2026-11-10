import { createHash } from "node:crypto";

// Listing view counting (S5 PR 5): our own page views of Vabrato's listings,
// shown to the seller as weekly counts. The browser only says which listing;
// the server decides whether it counts and calls record_listing_view() with
// LISTING_VIEW_SECRET (review item 10). The visitor is a hash of the IP and
// that secret: the IP is never stored.

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|embedly|curl|wget|python|java\/|httpclient|axios|node-fetch|monitor|uptime/i;

/** True for crawlers, link previews, prefetches and scripted clients. */
export function isBotRequest(headers: Headers): boolean {
  const ua = headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return true;
  const purpose = headers.get("sec-purpose") ?? headers.get("purpose") ?? "";
  return /prefetch|prerender/i.test(purpose);
}

export const LISTING_KEY_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function visitorHash(ip: string, secret: string): string {
  return createHash("sha256").update(`${secret}:listing-view:${ip}`).digest("hex");
}

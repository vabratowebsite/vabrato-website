import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// The one-time state of a Google Calendar connection in progress
// (Integrations PR 1). Kept in an httpOnly cookie for ten minutes, scoped to
// the callback path; the callback deletes it whatever happens.

export const OAUTH_COOKIE = "vb_google_oauth";

export const oauthCookieOptions = (req: NextRequest) => ({
  httpOnly: true,
  secure: req.nextUrl.protocol === "https:",
  sameSite: "lax" as const,
  path: "/integrations/google",
  maxAge: 600,
});

export interface OAuthCookie {
  state: string;
  verifier: string;
  profileId: string;
}

export function readOAuthCookie(raw: string | undefined): OAuthCookie | null {
  if (!raw || raw.length > 1000) return null;
  try {
    const v = JSON.parse(raw) as Partial<OAuthCookie>;
    if (typeof v.state !== "string" || typeof v.verifier !== "string" || typeof v.profileId !== "string") return null;
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(v.state) || !/^[A-Za-z0-9_-]{43,128}$/.test(v.verifier)) return null;
    return { state: v.state, verifier: v.verifier, profileId: v.profileId };
  } catch {
    return null;
  }
}

/** Constant-time comparison of the state Google sent back with ours. */
export function sameState(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The message Settings shows after a connection attempt (?google=…). */
export const CONNECT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Calendar connected. Your approved appointments and key dates are being added." },
  denied: { ok: false, text: "Google Calendar wasn't connected: access wasn't allowed on Google's page." },
  expired: { ok: false, text: "That connection attempt expired or didn't match. Please try Connect again." },
  unverified: { ok: false, text: "Google hasn't verified that account's email address, so it can't be connected." },
  failed: { ok: false, text: "Google Calendar couldn't be connected. Please try again in a few minutes." },
  not_ready: { ok: false, text: "Google Calendar isn't set up yet." },
  disconnected: { ok: true, text: "Google Calendar disconnected. The events the console added were removed, and its access to your Google account was removed." },
  disconnected_partial: {
    ok: false,
    text: "Disconnected here, but Google couldn't be reached: remove the console's access in your Google Account's security settings, and delete any events it added that are still there.",
  },
};

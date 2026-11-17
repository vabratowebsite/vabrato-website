import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// The one-time state of a Google or Dropbox connection in progress
// (Integrations PR 1 and 2; the team calendar since 0045). Kept in an
// httpOnly cookie for ten minutes, scoped to the callback path; the callback
// deletes it whatever happens.

export const OAUTH_COOKIE = "vb_google_oauth";
/** Dropbox's connection in progress (Integrations PR 2): the same shape, its own cookie and path. */
export const DROPBOX_COOKIE = "vb_dropbox_oauth";

export const oauthCookieOptions = (req: NextRequest, path = "/integrations/google") => ({
  httpOnly: true,
  secure: req.nextUrl.protocol === "https:",
  sameSite: "lax" as const,
  path,
  maxAge: 600,
});

export interface OAuthCookie {
  state: string;
  verifier: string;
  profileId: string;
  /** What the person was connecting: the team calendar (admins only), their Drive imports or their Dropbox. */
  purpose: "team" | "drive" | "dropbox";
}

export function readOAuthCookie(raw: string | undefined): OAuthCookie | null {
  if (!raw || raw.length > 1000) return null;
  try {
    const v = JSON.parse(raw) as Partial<OAuthCookie>;
    if (typeof v.state !== "string" || typeof v.verifier !== "string" || typeof v.profileId !== "string") return null;
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(v.state) || !/^[A-Za-z0-9_-]{43,128}$/.test(v.verifier)) return null;
    // Anything unknown is read as Drive, the narrowest Google access (and stored only for that person).
    const purpose = v.purpose === "team" || v.purpose === "dropbox" ? v.purpose : "drive";
    return { state: v.state, verifier: v.verifier, profileId: v.profileId, purpose };
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
  team_connected: { ok: true, text: "Team calendar connected. The “Vabrato” calendar is being filled in; share it with the team in Google Calendar (how-to below)." },
  team_scope: { ok: false, text: "The team calendar wasn't connected: on Google's page, tick the box that lets the console make and manage its own calendar, then try again." },
  admin_only: { ok: false, text: "Only an admin can connect the team calendar." },
  denied: { ok: false, text: "Nothing was connected: access wasn't allowed on Google's page." },
  expired: { ok: false, text: "That connection attempt expired or didn't match. Please try Connect again." },
  unverified: { ok: false, text: "Google hasn't verified that account's email address, so it can't be connected." },
  failed: { ok: false, text: "Google couldn't be connected. Please try again in a few minutes." },
  not_ready: { ok: false, text: "That connection isn't set up yet." },
  drive_connected: { ok: true, text: "Google Drive imports allowed. Use “Import from Google Drive” on a deal's Documents or Receipts." },
  dropbox_connected: { ok: true, text: "Dropbox connected. Put files in your Dropbox's Apps/Vabrato folder, then use “Import from Dropbox” on a deal." },
  dropbox_disconnected: { ok: true, text: "Dropbox disconnected, and the console's access to it was removed." },
  dropbox_disconnected_partial: { ok: false, text: "Disconnected here, but Dropbox couldn't be reached: remove the Vabrato app in your Dropbox account's Connected apps." },
  disconnected: { ok: true, text: "Google Drive imports disconnected, and the console's access to your Google account was removed. Files already imported stay on their deals." },
  disconnected_shared: { ok: true, text: "Google Drive imports disconnected. The same Google account also holds the team calendar, so the console keeps that access until the team calendar is disconnected." },
  disconnected_partial: { ok: false, text: "Disconnected here, but Google couldn't be reached: remove the console's access in your Google Account's security settings." },
  team_disconnected: {
    ok: true,
    text: "Team calendar disconnected, and the console's access to that Google account was removed. The “Vabrato” calendar stays in Google Calendar; delete it there if you no longer want it.",
  },
  team_disconnected_shared: {
    ok: true,
    text: "Team calendar disconnected. That Google account is also used for Drive imports, so its access stays until Drive is disconnected too. The “Vabrato” calendar stays in Google Calendar.",
  },
  team_disconnected_partial: {
    ok: false,
    text: "Disconnected here, but Google couldn't be reached: remove the console's access in that Google Account's security settings. The “Vabrato” calendar stays in Google Calendar.",
  },
};

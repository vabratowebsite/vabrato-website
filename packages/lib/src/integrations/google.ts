import { createHash, randomBytes } from "node:crypto";
import { tokenKey, TokenKeyError } from "./crypto";

// Google for the console's connected accounts (Integrations PR 1, team
// calendar 0045): our own OAuth flow (separate from Supabase sign-in) and the
// few Calendar calls we make. Plain fetch, no SDK. The base URLs come from env so tests and QA can
// point them at the fake (fake-google.ts), like ANTHROPIC_BASE_URL. Nothing
// here logs or returns a token in an error.

/**
 * The team calendar (0045): make secondary calendars, and manage events only
 * on calendars this app made. The console can't see or change any other
 * calendar in the account.
 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
/** Drive access to the files the person picks in Google's picker only (Integrations PR 2). */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export interface GoogleSetup {
  clientId: string;
  clientSecret: string;
  key: Buffer;
  accountsBase: string;
  oauthBase: string;
  apiBase: string;
}

export type SetupState = { ok: true; setup: GoogleSetup } | { ok: false; missing: string[] };

const base = (v: string | undefined, fallback: string) => (v?.trim() || fallback).replace(/\/+$/, "");

/** The Google integration's settings from the server env, or the names of what's missing (never values). */
export function googleSetup(env: Record<string, string | undefined> = process.env): SetupState {
  const missing: string[] = [];
  const clientId = env.GOOGLE_INTEGRATION_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_INTEGRATION_CLIENT_SECRET?.trim();
  if (!clientId) missing.push("GOOGLE_INTEGRATION_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_INTEGRATION_CLIENT_SECRET");
  let key: Buffer | null = null;
  try {
    key = tokenKey(env.INTEGRATIONS_TOKEN_KEY);
  } catch (e) {
    if (!(e instanceof TokenKeyError)) throw e;
    missing.push("INTEGRATIONS_TOKEN_KEY");
  }
  if (missing.length || !key) return { ok: false, missing };
  return {
    ok: true,
    setup: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      key,
      accountsBase: base(env.GOOGLE_ACCOUNTS_BASE_URL, "https://accounts.google.com"),
      oauthBase: base(env.GOOGLE_OAUTH_BASE_URL, "https://oauth2.googleapis.com"),
      apiBase: base(env.GOOGLE_API_BASE_URL, "https://www.googleapis.com"),
    },
  };
}

/** A PKCE verifier and its S256 challenge. */
export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier) };
}
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const newState = () => randomBytes(24).toString("base64url");

/**
 * Google's consent page. `scopes` are the team calendar's and/or Drive's; with
 * `includeGranted: false` the token carries only what's asked for now (the
 * team calendar's own token isn't mixed with the admin's Drive access).
 */
export function consentUrl(s: GoogleSetup, o: { redirectUri: string; state: string; challenge: string; loginHint?: string; scopes?: readonly string[]; includeGranted?: boolean }): string {
  const scopes = ["openid", "email", ...(o.scopes ?? [CALENDAR_SCOPE]).filter((x) => x === CALENDAR_SCOPE || x === DRIVE_SCOPE)];
  const q = new URLSearchParams({
    client_id: s.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: [...new Set(scopes)].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: o.includeGranted === false ? "false" : "true",
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
  });
  if (o.loginHint) q.set("login_hint", o.loginHint);
  return `${s.accountsBase}/o/oauth2/v2/auth?${q}`;
}

/** Google refused the stored token (revoked, expired or the app removed): the person reconnects. */
export class GoogleReconnectError extends Error {
  constructor() {
    super("Google needs you to reconnect your account");
    this.name = "GoogleReconnectError";
  }
}

/** Any other failure talking to Google: the status only. */
export class GoogleError extends Error {
  constructor(readonly status: number) {
    super(`Google answered ${status}`);
    this.name = "GoogleError";
  }
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 10_000;

async function call(f: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GoogleError(0);
  }
}

async function json<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new GoogleError(res.status);
  }
}

const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

/** The authorization code for tokens. A refresh token is required (offline access). */
export async function exchangeCode(s: GoogleSetup, o: { code: string; verifier: string; redirectUri: string }, f: Fetch = fetch): Promise<{ refreshToken: string; accessToken: string; scopes: string[] }> {
  const res = await call(f, `${s.oauthBase}/token`, form({ grant_type: "authorization_code", code: o.code, code_verifier: o.verifier, redirect_uri: o.redirectUri, client_id: s.clientId, client_secret: s.clientSecret }));
  if (res.status === 400) throw new GoogleReconnectError();
  if (!res.ok) throw new GoogleError(res.status);
  const body = await json<{ access_token?: string; refresh_token?: string; scope?: string }>(res);
  if (!body.access_token || !body.refresh_token) throw new GoogleError(res.status);
  return { refreshToken: body.refresh_token, accessToken: body.access_token, scopes: (body.scope ?? "").split(/\s+/).filter(Boolean).slice(0, 10) };
}

/** The connected account's email, and whether Google verified it. */
export async function accountEmail(s: GoogleSetup, accessToken: string, f: Fetch = fetch): Promise<{ email: string; verified: boolean }> {
  const res = await call(f, `${s.apiBase}/oauth2/v3/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new GoogleReconnectError();
  if (!res.ok) throw new GoogleError(res.status);
  const body = await json<{ email?: string; email_verified?: boolean | string }>(res);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) throw new GoogleError(res.status);
  return { email, verified: body.email_verified === true || body.email_verified === "true" };
}

/**
 * A fresh access token from the stored refresh token (never stored itself).
 * With `scopes`, Google narrows the token to just those (the picker gets a
 * drive.file-only token, never Calendar access).
 */
export async function accessTokenFor(s: GoogleSetup, refreshToken: string, f: Fetch = fetch, scopes?: readonly string[]): Promise<string> {
  const params: Record<string, string> = { grant_type: "refresh_token", refresh_token: refreshToken, client_id: s.clientId, client_secret: s.clientSecret };
  if (scopes?.length) params.scope = scopes.join(" ");
  const res = await call(f, `${s.oauthBase}/token`, form(params));
  if (res.status === 400 || res.status === 401) throw new GoogleReconnectError();
  if (!res.ok) throw new GoogleError(res.status);
  const body = await json<{ access_token?: string }>(res);
  if (!body.access_token) throw new GoogleError(res.status);
  return body.access_token;
}

/** Revokes the token at Google. Already-revoked counts as done. */
export async function revokeToken(s: GoogleSetup, token: string, f: Fetch = fetch): Promise<void> {
  const res = await call(f, `${s.oauthBase}/revoke`, form({ token }));
  if (!res.ok && res.status !== 400) throw new GoogleError(res.status);
}

// Calendar ------------------------------------------------------------------------------------------

export interface GoogleEventBody {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string } | { date: string };
  end: { dateTime: string; timeZone: string } | { date: string };
  /** "default": the people the calendar is shared with see the details (a team calendar). */
  visibility: "default";
  transparency: "opaque" | "transparent";
  reminders: { useDefault: true };
  extendedProperties: { private: { vabratoKey: string } };
}

export interface CalendarApi {
  create(body: GoogleEventBody): Promise<string>;
  update(eventId: string, body: GoogleEventBody): Promise<"ok" | "gone">;
  remove(eventId: string): Promise<void>;
}

/** The team calendar was deleted in Google (or isn't one this app made): make a new one. */
export class CalendarGoneError extends Error {
  constructor() {
    super("The team calendar isn't there any more");
    this.name = "CalendarGoneError";
  }
}

const calendarPath = (calendarId: string) => `/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

function check(res: Response): void {
  if (res.status === 401) throw new GoogleReconnectError();
  if (!res.ok) throw new GoogleError(res.status);
}

/** Makes the team calendar in the connected account; returns its id. */
export async function createCalendar(s: GoogleSetup, accessToken: string, o: { name: string; timeZone: string; description: string }, f: Fetch = fetch): Promise<string> {
  const res = await call(f, `${s.apiBase}/calendar/v3/calendars`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ summary: o.name, timeZone: o.timeZone, description: o.description }),
  });
  check(res);
  const out = await json<{ id?: string }>(res);
  if (!out.id || out.id.length > 1024) throw new GoogleError(res.status);
  return out.id;
}

/** Whether the team calendar is still there (the owner may have deleted it in Google). */
export async function calendarExists(s: GoogleSetup, accessToken: string, calendarId: string, f: Fetch = fetch): Promise<boolean> {
  const res = await call(f, `${s.apiBase}${calendarPath(calendarId)}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 404 || res.status === 410) return false;
  check(res);
  return true;
}

/** The team calendar's events, with an access token. Only events we made are touched. */
export function calendarApi(s: GoogleSetup, accessToken: string, calendarId: string, f: Fetch = fetch): CalendarApi {
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  const EVENTS = `${calendarPath(calendarId)}/events`;
  return {
    async create(body) {
      const res = await call(f, `${s.apiBase}${EVENTS}?sendUpdates=none`, { method: "POST", headers, body: JSON.stringify(body) });
      if (res.status === 404 || res.status === 410) throw new CalendarGoneError();
      check(res);
      const out = await json<{ id?: string }>(res);
      if (!out.id || out.id.length > 1024) throw new GoogleError(res.status);
      return out.id;
    },
    async update(eventId, body) {
      const res = await call(f, `${s.apiBase}${EVENTS}/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "PATCH", headers, body: JSON.stringify(body) });
      if (res.status === 404 || res.status === 410) return "gone";
      check(res);
      return "ok";
    },
    async remove(eventId) {
      const res = await call(f, `${s.apiBase}${EVENTS}/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "DELETE", headers });
      if (res.status === 404 || res.status === 410) return;
      check(res);
    },
  };
}

// Drive (Integrations PR 2) ---------------------------------------------------------------------------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

/** Google's own formats (Docs, Sheets) have no file to download. */
export const isGoogleNativeFile = (mimeType: string) => mimeType.startsWith("application/vnd.google-apps.");

export const DRIVE_ID = /^[A-Za-z0-9_-]{5,200}$/;

/** A picked file's name, type and size. Only files the person picked are visible with drive.file. */
export async function driveFile(s: GoogleSetup, accessToken: string, id: string, f: Fetch = fetch): Promise<DriveFile> {
  if (!DRIVE_ID.test(id)) throw new GoogleError(400);
  const res = await call(f, `${s.apiBase}/drive/v3/files/${id}?fields=id,name,mimeType,size,trashed&supportsAllDrives=true`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new GoogleReconnectError();
  if (!res.ok) throw new GoogleError(res.status);
  const b = await json<{ id?: string; name?: string; mimeType?: string; size?: string | number; trashed?: boolean }>(res);
  if (b.id !== id || typeof b.name !== "string" || b.trashed) throw new GoogleError(404);
  return { id, name: b.name.slice(0, 300), mimeType: String(b.mimeType ?? ""), size: Number(b.size ?? 0) };
}

/** A picked file's bytes, refusing more than maxBytes (null when it's too big). */
export async function driveDownload(s: GoogleSetup, accessToken: string, id: string, maxBytes: number, f: Fetch = fetch): Promise<Uint8Array | null> {
  if (!DRIVE_ID.test(id)) throw new GoogleError(400);
  const res = await call(f, `${s.apiBase}/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new GoogleReconnectError();
  if (!res.ok) throw new GoogleError(res.status);
  return readCapped(res, maxBytes);
}

/** Reads a response body, stopping (null) once it passes maxBytes. */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

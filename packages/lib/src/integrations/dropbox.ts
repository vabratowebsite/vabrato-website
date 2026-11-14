import { tokenKey, TokenKeyError } from "./crypto";
import { readCapped } from "./google";

// Dropbox for the console's file import (Integrations PR 2). The Dropbox app
// has App-folder access only (Apps/Vabrato) and read permissions only: the
// console lists that folder and downloads what a person picks; it never
// writes or moves anything. Our own OAuth flow with PKCE and offline access,
// plain fetch, base URLs from env so tests and QA use the fake
// (fake-dropbox.ts). Nothing here logs or returns a token in an error.

export interface DropboxSetup {
  appKey: string;
  appSecret: string;
  key: Buffer;
  wwwBase: string;
  apiBase: string;
  contentBase: string;
}

export type DropboxSetupState = { ok: true; setup: DropboxSetup } | { ok: false; missing: string[] };

const base = (v: string | undefined, fallback: string) => (v?.trim() || fallback).replace(/\/+$/, "");

/** The Dropbox integration's settings from the server env, or the names of what's missing (never values). */
export function dropboxSetup(env: Record<string, string | undefined> = process.env): DropboxSetupState {
  const missing: string[] = [];
  const appKey = env.DROPBOX_APP_KEY?.trim();
  const appSecret = env.DROPBOX_APP_SECRET?.trim();
  if (!appKey) missing.push("DROPBOX_APP_KEY");
  if (!appSecret) missing.push("DROPBOX_APP_SECRET");
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
      appKey: appKey!,
      appSecret: appSecret!,
      key,
      wwwBase: base(env.DROPBOX_WWW_BASE_URL, "https://www.dropbox.com"),
      apiBase: base(env.DROPBOX_API_BASE_URL, "https://api.dropboxapi.com"),
      contentBase: base(env.DROPBOX_CONTENT_BASE_URL, "https://content.dropboxapi.com"),
    },
  };
}

/** Dropbox's consent page: offline access, PKCE. The app's permissions are set in the Dropbox App Console. */
export function dropboxConsentUrl(s: DropboxSetup, o: { redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: s.appKey,
    redirect_uri: o.redirectUri,
    response_type: "code",
    token_access_type: "offline",
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
  });
  return `${s.wwwBase}/oauth2/authorize?${q}`;
}

/** Dropbox refused the stored token (revoked, expired or the app removed): the person reconnects. */
export class DropboxReconnectError extends Error {
  constructor() {
    super("Dropbox needs you to reconnect your account");
    this.name = "DropboxReconnectError";
  }
}

/** Any other failure talking to Dropbox: the status only. */
export class DropboxError extends Error {
  constructor(readonly status: number) {
    super(`Dropbox answered ${status}`);
    this.name = "DropboxError";
  }
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 15_000;

async function call(f: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new DropboxError(0);
  }
}

async function json<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new DropboxError(res.status);
  }
}

const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

function check(res: Response): void {
  if (res.status === 401) throw new DropboxReconnectError();
  if (!res.ok) throw new DropboxError(res.status);
}

/** The authorization code for tokens. A refresh token is required (offline access). */
export async function dropboxExchangeCode(s: DropboxSetup, o: { code: string; verifier: string; redirectUri: string }, f: Fetch = fetch): Promise<{ refreshToken: string; accessToken: string; scopes: string[] }> {
  const res = await call(f, `${s.apiBase}/oauth2/token`, form({ grant_type: "authorization_code", code: o.code, code_verifier: o.verifier, redirect_uri: o.redirectUri, client_id: s.appKey, client_secret: s.appSecret }));
  if (res.status === 400) throw new DropboxReconnectError();
  if (!res.ok) throw new DropboxError(res.status);
  const body = await json<{ access_token?: string; refresh_token?: string; scope?: string }>(res);
  if (!body.access_token || !body.refresh_token) throw new DropboxError(res.status);
  return { refreshToken: body.refresh_token, accessToken: body.access_token, scopes: (body.scope ?? "").split(/\s+/).filter(Boolean).slice(0, 10) };
}

/** A fresh access token from the stored refresh token (never stored itself). */
export async function dropboxAccessToken(s: DropboxSetup, refreshToken: string, f: Fetch = fetch): Promise<string> {
  const res = await call(f, `${s.apiBase}/oauth2/token`, form({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: s.appKey, client_secret: s.appSecret }));
  if (res.status === 400 || res.status === 401) throw new DropboxReconnectError();
  if (!res.ok) throw new DropboxError(res.status);
  const body = await json<{ access_token?: string }>(res);
  if (!body.access_token) throw new DropboxError(res.status);
  return body.access_token;
}

/** Revokes the token at Dropbox (with an access token). Already revoked counts as done. */
export async function dropboxRevoke(s: DropboxSetup, accessToken: string, f: Fetch = fetch): Promise<void> {
  const res = await call(f, `${s.apiBase}/2/auth/token/revoke`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 401) throw new DropboxError(res.status);
}

/** The connected account's email, and whether Dropbox verified it. */
export async function dropboxAccount(s: DropboxSetup, accessToken: string, f: Fetch = fetch): Promise<{ email: string; verified: boolean }> {
  const res = await call(f, `${s.apiBase}/2/users/get_current_account`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
  check(res);
  const b = await json<{ email?: string; email_verified?: boolean }>(res);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) throw new DropboxError(res.status);
  return { email, verified: b.email_verified === true };
}

export interface DropboxFile {
  /** Dropbox's stable id, "id:…". */
  id: string;
  name: string;
  size: number;
  modified: string;
}

export const DROPBOX_ID = /^id:[A-Za-z0-9_-]{5,200}$/;
export const MAX_LIST = 500;

/** The files at the top of the app folder (Apps/Vabrato), newest first, at most MAX_LIST. */
export async function dropboxListFolder(s: DropboxSetup, accessToken: string, f: Fetch = fetch): Promise<{ files: DropboxFile[]; more: boolean }> {
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  let res = await call(f, `${s.apiBase}/2/files/list_folder`, { method: "POST", headers, body: JSON.stringify({ path: "", recursive: false, limit: 200 }) });
  const files: DropboxFile[] = [];
  for (let page = 0; page < 10; page++) {
    check(res);
    const b = await json<{ entries?: { ".tag"?: string; id?: string; name?: string; size?: number; server_modified?: string }[]; cursor?: string; has_more?: boolean }>(res);
    for (const e of b.entries ?? []) {
      if (e[".tag"] !== "file" || !e.id || !DROPBOX_ID.test(e.id) || typeof e.name !== "string") continue;
      files.push({ id: e.id, name: e.name.slice(0, 300), size: Number(e.size ?? 0), modified: String(e.server_modified ?? "") });
    }
    if (!b.has_more || !b.cursor || files.length >= MAX_LIST) {
      files.sort((a, c) => c.modified.localeCompare(a.modified));
      return { files: files.slice(0, MAX_LIST), more: Boolean(b.has_more) || files.length > MAX_LIST };
    }
    res = await call(f, `${s.apiBase}/2/files/list_folder/continue`, { method: "POST", headers, body: JSON.stringify({ cursor: b.cursor }) });
  }
  return { files: files.slice(0, MAX_LIST), more: true };
}

/** A file's name, size and bytes, refusing more than maxBytes (bytes null when it's too big). */
export async function dropboxDownload(s: DropboxSetup, accessToken: string, id: string, maxBytes: number, f: Fetch = fetch): Promise<{ name: string; size: number; bytes: Uint8Array | null }> {
  if (!DROPBOX_ID.test(id)) throw new DropboxError(400);
  const res = await call(f, `${s.contentBase}/2/files/download`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "dropbox-api-arg": JSON.stringify({ path: id }) } });
  if (res.status === 409) throw new DropboxError(404);
  check(res);
  let meta: { name?: string; size?: number; id?: string } = {};
  try {
    meta = JSON.parse(res.headers.get("dropbox-api-result") ?? "{}");
  } catch {
    meta = {};
  }
  if (meta.id && meta.id !== id) throw new DropboxError(404);
  const size = Number(meta.size ?? 0);
  if (size > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return { name: String(meta.name ?? "document").slice(0, 300), size, bytes: null };
  }
  const bytes = await readCapped(res, maxBytes);
  return { name: String(meta.name ?? "document").slice(0, 300), size: bytes ? bytes.byteLength : size, bytes };
}

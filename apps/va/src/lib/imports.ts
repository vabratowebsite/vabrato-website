import { createServiceSupabase } from "@vabrato/lib";
import {
  accessTokenFor,
  decryptToken,
  DRIVE_SCOPE,
  driveDownload,
  driveFile,
  dropboxAccessToken,
  dropboxDownload,
  DropboxReconnectError,
  dropboxSetup,
  GoogleReconnectError,
  googleSetup,
  isGoogleNativeFile,
  TokenDecryptError,
  type DropboxSetup,
  type GoogleSetup,
} from "@vabrato/lib/integrations";

// Importing files from Google Drive and Dropbox into a deal (Integrations
// PR 2). Server only: it reads the person's encrypted token with the service
// role, gets a fresh access token and fetches the file. Every file then goes
// through the same checks as an upload (real type, size) in the actions.

export const DRIVE_FLAG = "integration_google_drive";
export const DROPBOX_FLAG = "integration_dropbox";
export type ImportSource = "drive" | "dropbox";

export const refFor = (source: ImportSource, id: string) => `${source}:${id}`;

/** The picker's browser key and the Cloud project number (Google calls it the app id). */
export function pickerSettings(env: Record<string, string | undefined> = process.env): { apiKey: string; appId: string; scriptUrl: string } | null {
  const apiKey = env.GOOGLE_PICKER_API_KEY?.trim();
  const appId = env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim();
  if (!apiKey || !appId || !/^\d{6,20}$/.test(appId)) return null;
  return { apiKey, appId, scriptUrl: env.GOOGLE_PICKER_SCRIPT_URL?.trim() || "https://apis.google.com/js/api.js" };
}

async function flags(): Promise<Record<string, boolean>> {
  const { data } = await createServiceSupabase().from("feature_flags").select("key, enabled").in("key", [DRIVE_FLAG, DROPBOX_FLAG]);
  return Object.fromEntries((data ?? []).map((f) => [f.key, f.enabled]));
}

/** Which switches are on and set up (env), whoever is asking. */
export async function importSwitches(): Promise<{ drive: boolean; dropbox: boolean; driveMissing: string[]; dropboxMissing: string[] }> {
  const f = await flags().catch(() => ({}) as Record<string, boolean>);
  const g = googleSetup();
  const d = dropboxSetup();
  const driveMissing = [...(g.ok ? [] : g.missing), ...(pickerSettings() ? [] : ["GOOGLE_PICKER_API_KEY", "GOOGLE_CLOUD_PROJECT_NUMBER"])];
  return { drive: Boolean(f[DRIVE_FLAG]) && !driveMissing.length, dropbox: Boolean(f[DROPBOX_FLAG]) && d.ok, driveMissing, dropboxMissing: d.ok ? [] : d.missing };
}

async function connection(profileId: string, provider: "google" | "dropbox") {
  const { data } = await createServiceSupabase().from("staff_connections").select("token_ciphertext, scopes, last_error").eq("profile_id", profileId).eq("provider", provider).maybeSingle();
  return data;
}

export type ImportReady = { drive: "ready" | "connect" | "off"; dropbox: "ready" | "connect" | "off" };

/** For one person: whether each import can be used now, or needs connecting first. */
export async function importReadiness(profileId: string): Promise<ImportReady> {
  const sw = await importSwitches();
  const [g, d] = await Promise.all([sw.drive ? connection(profileId, "google") : null, sw.dropbox ? connection(profileId, "dropbox") : null]);
  return {
    drive: !sw.drive ? "off" : g && g.scopes.includes(DRIVE_SCOPE) && g.last_error !== "reconnect" ? "ready" : "connect",
    dropbox: !sw.dropbox ? "off" : d && d.last_error !== "reconnect" ? "ready" : "connect",
  };
}

const markReconnect = (profileId: string, provider: "google" | "dropbox") =>
  createServiceSupabase().from("staff_connections").update({ last_error: "reconnect" }).eq("profile_id", profileId).eq("provider", provider);

export class ImportNotReady extends Error {
  constructor(readonly reason: "off" | "connect" | "reconnect") {
    super(reason);
  }
}

/** A Drive access token for this person: narrowed to drive.file for the picker, or as granted. */
export async function driveToken(profileId: string, narrow: boolean): Promise<{ token: string; setup: GoogleSetup }> {
  const sw = await importSwitches();
  const s = googleSetup();
  if (!sw.drive || !s.ok) throw new ImportNotReady("off");
  const conn = await connection(profileId, "google");
  if (!conn || !conn.scopes.includes(DRIVE_SCOPE)) throw new ImportNotReady("connect");
  try {
    const token = await accessTokenFor(s.setup, decryptToken(conn.token_ciphertext, s.setup.key), fetch, narrow ? [DRIVE_SCOPE] : undefined);
    return { token, setup: s.setup };
  } catch (e) {
    if (e instanceof GoogleReconnectError || e instanceof TokenDecryptError) {
      await markReconnect(profileId, "google");
      throw new ImportNotReady("reconnect");
    }
    throw e;
  }
}

export async function dropboxToken(profileId: string): Promise<{ token: string; setup: DropboxSetup }> {
  const sw = await importSwitches();
  const s = dropboxSetup();
  if (!sw.dropbox || !s.ok) throw new ImportNotReady("off");
  const conn = await connection(profileId, "dropbox");
  if (!conn) throw new ImportNotReady("connect");
  try {
    return { token: await dropboxAccessToken(s.setup, decryptToken(conn.token_ciphertext, s.setup.key)), setup: s.setup };
  } catch (e) {
    if (e instanceof DropboxReconnectError || e instanceof TokenDecryptError) {
      await markReconnect(profileId, "dropbox");
      throw new ImportNotReady("reconnect");
    }
    throw e;
  }
}

export type Fetched = { ok: true; name: string; bytes: Uint8Array } | { ok: false; name: string; error: string };

const tooBig = (maxBytes: number) => `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller. Export it again at a lower scan quality, or split it.`;

/** One file's bytes from Drive or Dropbox, or a plain-words reason it can't be imported. */
export async function fetchFile(source: ImportSource, auth: { token: string; setup: GoogleSetup | DropboxSetup }, id: string, maxBytes: number): Promise<Fetched> {
  try {
    if (source === "drive") {
      const s = auth.setup as GoogleSetup;
      const meta = await driveFile(s, auth.token, id);
      if (isGoogleNativeFile(meta.mimeType)) return { ok: false, name: meta.name, error: "Google Docs, Sheets and Slides can't be imported as they are. In Drive, download it as a PDF, upload that, then import it." };
      if (meta.size > maxBytes) return { ok: false, name: meta.name, error: tooBig(maxBytes) };
      const bytes = await driveDownload(s, auth.token, id, maxBytes);
      return bytes ? { ok: true, name: meta.name, bytes } : { ok: false, name: meta.name, error: tooBig(maxBytes) };
    }
    const got = await dropboxDownload(auth.setup as DropboxSetup, auth.token, id, maxBytes);
    return got.bytes ? { ok: true, name: got.name, bytes: got.bytes } : { ok: false, name: got.name, error: tooBig(maxBytes) };
  } catch (e) {
    if (e instanceof GoogleReconnectError || e instanceof DropboxReconnectError) throw new ImportNotReady("reconnect");
    return { ok: false, name: "That file", error: "Couldn't fetch that file. It may have been moved or deleted. Try again." };
  }
}

export const NOT_READY_TEXT: Record<ImportNotReady["reason"], string> = {
  off: "Importing from there isn't switched on.",
  connect: "Connect it in Settings first.",
  reconnect: "The connection needs renewing: reconnect in Settings.",
};

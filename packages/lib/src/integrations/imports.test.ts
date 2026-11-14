import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dropboxAccessToken, dropboxAccount, dropboxConsentUrl, dropboxDownload, dropboxExchangeCode, DropboxError, DropboxReconnectError, dropboxListFolder, dropboxRevoke, dropboxSetup, type DropboxSetup } from "./dropbox";
import { createFakeDropbox, fakeDropboxFetch, type FakeDropbox } from "./fake-dropbox";
import { createFakeGoogle, fakeFetch } from "./fake-google";
import { accessTokenFor, CALENDAR_SCOPE, consentUrl, DRIVE_SCOPE, driveDownload, driveFile, exchangeCode, GoogleError, GoogleReconnectError, googleSetup, isGoogleNativeFile, newPkce, readCapped, type GoogleSetup } from "./google";

// Integrations PR 2: Drive (narrowed tokens, file metadata, capped downloads)
// and Dropbox (OAuth, the app folder, downloads) against the fakes.
// Fictional files only.

const KEY = randomBytes(32).toString("base64");
const BASE = "http://fake.test";
const REDIRECT = "http://console.test/integrations/x/callback";

const gSetup = (): GoogleSetup => {
  const s = googleSetup({ GOOGLE_INTEGRATION_CLIENT_ID: "c", GOOGLE_INTEGRATION_CLIENT_SECRET: "s", INTEGRATIONS_TOKEN_KEY: KEY, GOOGLE_ACCOUNTS_BASE_URL: BASE, GOOGLE_OAUTH_BASE_URL: BASE, GOOGLE_API_BASE_URL: BASE });
  if (!s.ok) throw new Error("setup");
  return s.setup;
};
const dSetup = (): DropboxSetup => {
  const s = dropboxSetup({ DROPBOX_APP_KEY: "k", DROPBOX_APP_SECRET: "s", INTEGRATIONS_TOKEN_KEY: KEY, DROPBOX_WWW_BASE_URL: BASE, DROPBOX_API_BASE_URL: BASE, DROPBOX_CONTENT_BASE_URL: BASE });
  if (!s.ok) throw new Error("setup");
  return s.setup;
};

async function googleWith(scopes: string[], email = "agent@example.test") {
  const g = createFakeGoogle({ email });
  const f = fakeFetch(g);
  const { verifier, challenge } = newPkce();
  const res = await g.handle(new Request(consentUrl(gSetup(), { redirectUri: REDIRECT, state: "st", challenge, scopes })));
  const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
  const t = await exchangeCode(gSetup(), { code, verifier, redirectUri: REDIRECT }, f);
  return { g, f, refresh: t.refreshToken, scopes: t.scopes };
}

describe("Drive", () => {
  it("consent asks for Drive alongside Calendar, and only known scopes", () => {
    const url = new URL(consentUrl(gSetup(), { redirectUri: REDIRECT, state: "s", challenge: "c", scopes: [CALENDAR_SCOPE, DRIVE_SCOPE, "https://www.googleapis.com/auth/drive"] }));
    expect(url.searchParams.get("scope")).toBe(`openid email ${CALENDAR_SCOPE} ${DRIVE_SCOPE}`);
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("the picker's token is narrowed to drive.file; asking for more than was granted is refused", async () => {
    const { g, f, refresh } = await googleWith([CALENDAR_SCOPE, DRIVE_SCOPE]);
    const token = await accessTokenFor(gSetup(), refresh, f, [DRIVE_SCOPE]);
    expect(g.issuedScopes().at(-1)).toEqual([DRIVE_SCOPE]);
    const res = await g.handle(new Request(`${BASE}/__fake/picker-files`, { headers: { authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(200);
    const calendarOnly = await googleWith([CALENDAR_SCOPE]);
    await expect(accessTokenFor(gSetup(), calendarOnly.refresh, calendarOnly.f, [DRIVE_SCOPE])).rejects.toThrow(GoogleReconnectError);
  });

  it("the fake picker refuses a token that also carries Calendar access", async () => {
    const { g, f, refresh } = await googleWith([CALENDAR_SCOPE, DRIVE_SCOPE]);
    const wide = await accessTokenFor(gSetup(), refresh, f);
    expect((await g.handle(new Request(`${BASE}/__fake/picker-files`, { headers: { authorization: `Bearer ${wide}` } }))).status).toBe(403);
  });

  it("reads a picked file's details and bytes; stops past the size limit", async () => {
    const { g, f, refresh } = await googleWith([DRIVE_SCOPE]);
    const pdf = g.addDriveFile("agent@example.test", "Inspection report.pdf", "pdf");
    const big = g.addDriveFile("agent@example.test", "Scan.pdf", "big");
    const token = await accessTokenFor(gSetup(), refresh, f, [DRIVE_SCOPE]);
    expect(await driveFile(gSetup(), token, pdf, f)).toMatchObject({ id: pdf, name: "Inspection report.pdf", mimeType: "application/pdf" });
    const bytes = await driveDownload(gSetup(), token, pdf, 1024 * 1024, f);
    expect(new TextDecoder().decode(bytes!.slice(0, 5))).toBe("%PDF-");
    expect(await driveDownload(gSetup(), token, big, 20 * 1024 * 1024, f)).toBeNull();
  });

  it("someone else's file, a bad id and a revoked access are refused", async () => {
    const { g, f, refresh } = await googleWith([DRIVE_SCOPE]);
    const theirs = g.addDriveFile("other@example.test", "Theirs.pdf", "pdf");
    const token = await accessTokenFor(gSetup(), refresh, f, [DRIVE_SCOPE]);
    await expect(driveFile(gSetup(), token, theirs, f)).rejects.toEqual(new GoogleError(404));
    await expect(driveFile(gSetup(), token, "../etc/passwd", f)).rejects.toEqual(new GoogleError(400));
    g.revokeAll();
    await expect(driveFile(gSetup(), token, theirs, f)).rejects.toThrow(GoogleReconnectError);
  });

  it("Google's own formats are recognised (they have no file to download)", () => {
    expect(isGoogleNativeFile("application/vnd.google-apps.document")).toBe(true);
    expect(isGoogleNativeFile("application/pdf")).toBe(false);
  });
});

describe("readCapped", () => {
  it("returns the body, or null past the limit (declared or streamed)", async () => {
    expect(await readCapped(new Response("hello"), 10)).toEqual(new TextEncoder().encode("hello"));
    expect(await readCapped(new Response("hello", { headers: { "content-length": "5000" } }), 10)).toBeNull();
    expect(await readCapped(new Response("x".repeat(50)), 10)).toBeNull();
  });
});

async function dropboxWith(email = "agent@example.test", pageSize?: number) {
  const d = createFakeDropbox({ email, pageSize });
  const f = fakeDropboxFetch(d);
  const { verifier, challenge } = newPkce();
  const res = await d.handle(new Request(dropboxConsentUrl(dSetup(), { redirectUri: REDIRECT, state: "st", challenge })));
  const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
  const t = await dropboxExchangeCode(dSetup(), { code, verifier, redirectUri: REDIRECT }, f);
  return { d, f, t };
}

describe("Dropbox", () => {
  it("setup names what's missing, never values", () => {
    expect(dropboxSetup({})).toEqual({ ok: false, missing: ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "INTEGRATIONS_TOKEN_KEY"] });
    const s = dropboxSetup({ DROPBOX_APP_KEY: "k", DROPBOX_APP_SECRET: "s", INTEGRATIONS_TOKEN_KEY: KEY });
    expect(s.ok && [s.setup.wwwBase, s.setup.apiBase, s.setup.contentBase]).toEqual(["https://www.dropbox.com", "https://api.dropboxapi.com", "https://content.dropboxapi.com"]);
  });

  it("consent asks for offline access with PKCE", () => {
    const url = new URL(dropboxConsentUrl(dSetup(), { redirectUri: REDIRECT, state: "s", challenge: "c" }));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "k", token_access_type: "offline", code_challenge_method: "S256", state: "s" });
    expect(url.toString()).not.toContain("client_secret");
  });

  it("connects, reads the account, refreshes and revokes", async () => {
    const { d, f, t } = await dropboxWith("Agent@Example.test");
    expect(await dropboxAccount(dSetup(), t.accessToken, f)).toEqual({ email: "agent@example.test", verified: true });
    const fresh = await dropboxAccessToken(dSetup(), t.refreshToken, f);
    await dropboxRevoke(dSetup(), fresh, f);
    expect(d.liveGrants()).toBe(0);
    await expect(dropboxAccessToken(dSetup(), t.refreshToken, f)).rejects.toThrow(DropboxReconnectError);
    expect(JSON.stringify(d.log)).not.toMatch(/fake-dbx-(refresh|access|code)/);
  });

  it("a wrong verifier is refused", async () => {
    const d = createFakeDropbox();
    const { challenge } = newPkce();
    const res = await d.handle(new Request(dropboxConsentUrl(dSetup(), { redirectUri: REDIRECT, state: "st", challenge })));
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
    await expect(dropboxExchangeCode(dSetup(), { code, verifier: newPkce().verifier, redirectUri: REDIRECT }, fakeDropboxFetch(d))).rejects.toThrow(DropboxReconnectError);
  });

  it("lists the app folder across pages, newest first, files only", async () => {
    const { d, f, t } = await dropboxWith("agent@example.test", 2);
    for (const n of ["a.pdf", "b.png", "c.pdf", "d.jpg", "e.pdf"]) d.addFile("agent@example.test", n, "pdf");
    d.addFile("other@example.test", "theirs.pdf", "pdf");
    const { files, more } = await dropboxListFolder(dSetup(), t.accessToken, f);
    expect(files.map((x) => x.name)).toEqual(["e.pdf", "d.jpg", "c.pdf", "b.png", "a.pdf"]);
    expect(more).toBe(false);
    expect(files.every((x) => /^id:/.test(x.id))).toBe(true);
  });

  it("downloads a file; stops past the size limit; someone else's or a bad id is refused", async () => {
    const { d, f, t } = await dropboxWith();
    const pdf = d.addFile("agent@example.test", "Receipt.pdf", "pdf");
    const big = d.addFile("agent@example.test", "Big scan.pdf", "big");
    const theirs = d.addFile("other@example.test", "Theirs.pdf", "pdf");
    const got = await dropboxDownload(dSetup(), t.accessToken, pdf, 1024 * 1024, f);
    expect(got.name).toBe("Receipt.pdf");
    expect(new TextDecoder().decode(got.bytes!.slice(0, 5))).toBe("%PDF-");
    expect((await dropboxDownload(dSetup(), t.accessToken, big, 20 * 1024 * 1024, f)).bytes).toBeNull();
    await expect(dropboxDownload(dSetup(), t.accessToken, theirs, 1024, f)).rejects.toEqual(new DropboxError(404));
    await expect(dropboxDownload(dSetup(), t.accessToken, "/Apps/Vabrato/x.pdf", 1024, f)).rejects.toEqual(new DropboxError(400));
  });

  it("a revoked access asks the person to reconnect", async () => {
    const { d, f, t } = await dropboxWith();
    d.revokeAll();
    await expect(dropboxListFolder(dSetup(), t.accessToken, f)).rejects.toThrow(DropboxReconnectError);
  });
});

export type { FakeDropbox };

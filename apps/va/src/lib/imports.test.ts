import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeDropbox } from "@vabrato/lib/integrations/fake-dropbox";
import { createFakeGoogle } from "@vabrato/lib/integrations/fake-google";
import { dropboxSetup, googleSetup, newPkce, consentUrl, exchangeCode, accessTokenFor, DRIVE_SCOPE, dropboxConsentUrl, dropboxExchangeCode } from "@vabrato/lib/integrations";
import { EXTERNAL_REF } from "./documents";
import { fetchFile, ImportNotReady, pickerSettings, refFor } from "./imports";

// Integrations PR 2: what the console fetches from Drive and Dropbox before
// the upload checks, against the fakes. Fictional files only.

const KEY = randomBytes(32).toString("base64");
const BASE = "http://fake.test";
const REDIRECT = "http://console.test/integrations/x/callback";
const MB = 1024 * 1024;

afterEach(() => vi.unstubAllGlobals());

function viaFake(handle: (r: Request) => Promise<Response>) {
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => handle(new Request(input, init)));
}

async function drive() {
  const g = createFakeGoogle({ email: "agent@example.test" });
  viaFake(g.handle);
  const s = googleSetup({ GOOGLE_INTEGRATION_CLIENT_ID: "c", GOOGLE_INTEGRATION_CLIENT_SECRET: "s", INTEGRATIONS_TOKEN_KEY: KEY, GOOGLE_ACCOUNTS_BASE_URL: BASE, GOOGLE_OAUTH_BASE_URL: BASE, GOOGLE_API_BASE_URL: BASE });
  if (!s.ok) throw new Error("setup");
  const { verifier, challenge } = newPkce();
  const res = await g.handle(new Request(consentUrl(s.setup, { redirectUri: REDIRECT, state: "st", challenge, scopes: [DRIVE_SCOPE] })));
  const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
  const t = await exchangeCode(s.setup, { code, verifier, redirectUri: REDIRECT });
  return { g, auth: { token: await accessTokenFor(s.setup, t.refreshToken, fetch, [DRIVE_SCOPE]), setup: s.setup } };
}

async function dropbox() {
  const d = createFakeDropbox({ email: "agent@example.test" });
  viaFake(d.handle);
  const s = dropboxSetup({ DROPBOX_APP_KEY: "k", DROPBOX_APP_SECRET: "s", INTEGRATIONS_TOKEN_KEY: KEY, DROPBOX_WWW_BASE_URL: BASE, DROPBOX_API_BASE_URL: BASE, DROPBOX_CONTENT_BASE_URL: BASE });
  if (!s.ok) throw new Error("setup");
  const { verifier, challenge } = newPkce();
  const res = await d.handle(new Request(dropboxConsentUrl(s.setup, { redirectUri: REDIRECT, state: "st", challenge })));
  const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
  const t = await dropboxExchangeCode(s.setup, { code, verifier, redirectUri: REDIRECT });
  return { d, auth: { token: t.accessToken, setup: s.setup } };
}

describe("picker settings", () => {
  it("need the browser key and a numeric project number; the script defaults to Google's", () => {
    expect(pickerSettings({})).toBeNull();
    expect(pickerSettings({ GOOGLE_PICKER_API_KEY: "k", GOOGLE_CLOUD_PROJECT_NUMBER: "my-project" })).toBeNull();
    expect(pickerSettings({ GOOGLE_PICKER_API_KEY: "k", GOOGLE_CLOUD_PROJECT_NUMBER: "123456789012" })).toEqual({ apiKey: "k", appId: "123456789012", scriptUrl: "https://apis.google.com/js/api.js" });
  });
});

describe("where an imported file came from", () => {
  it("refs match the database's format", () => {
    expect(EXTERNAL_REF.test(refFor("drive", "1AbCdEfGhIjKl"))).toBe(true);
    expect(EXTERNAL_REF.test(refFor("dropbox", "id:a4ayc_80_OEAAAA"))).toBe(true);
    expect(EXTERNAL_REF.test("dropbox:a4ayc_80_OEAAAA")).toBe(false);
  });
});

describe("fetching from Drive", () => {
  it("a picked PDF comes back as bytes with its name", async () => {
    const { g, auth } = await drive();
    const id = g.addDriveFile("agent@example.test", "Inspection report.pdf", "pdf");
    const got = await fetchFile("drive", auth, id, 20 * MB);
    expect(got.ok && got.name).toBe("Inspection report.pdf");
    expect(got.ok && new TextDecoder().decode(got.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("a Google Doc, an oversized file and a missing file are refused in plain words", async () => {
    const { g, auth } = await drive();
    const doc = g.addDriveFile("agent@example.test", "Notes", "gdoc");
    const big = g.addDriveFile("agent@example.test", "Scan.pdf", "big");
    expect(await fetchFile("drive", auth, doc, 20 * MB)).toMatchObject({ ok: false, error: expect.stringContaining("download it as a PDF") });
    expect(await fetchFile("drive", auth, big, 20 * MB)).toMatchObject({ ok: false, error: expect.stringContaining("20 MB or smaller") });
    expect(await fetchFile("drive", auth, "drvNotThere12345", 20 * MB)).toMatchObject({ ok: false, error: expect.stringContaining("moved or deleted") });
  });

  it("a revoked access asks for reconnecting", async () => {
    const { g, auth } = await drive();
    const id = g.addDriveFile("agent@example.test", "a.pdf", "pdf");
    g.revokeAll();
    await expect(fetchFile("drive", auth, id, MB)).rejects.toEqual(new ImportNotReady("reconnect"));
  });
});

describe("fetching from Dropbox", () => {
  it("a file in Apps/Vabrato comes back; an oversized one is refused", async () => {
    const { d, auth } = await dropbox();
    const ok = d.addFile("agent@example.test", "Receipt.png", "png");
    const big = d.addFile("agent@example.test", "Big.pdf", "big");
    const got = await fetchFile("dropbox", auth, ok, 10 * MB);
    expect(got.ok && got.name).toBe("Receipt.png");
    expect(await fetchFile("dropbox", auth, big, 10 * MB)).toMatchObject({ ok: false, error: expect.stringContaining("10 MB or smaller") });
  });

  it("a revoked access asks for reconnecting", async () => {
    const { d, auth } = await dropbox();
    const id = d.addFile("agent@example.test", "a.pdf", "pdf");
    d.revokeAll();
    await expect(fetchFile("dropbox", auth, id, MB)).rejects.toEqual(new ImportNotReady("reconnect"));
  });
});

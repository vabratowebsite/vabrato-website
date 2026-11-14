import { createHash, randomBytes } from "node:crypto";
import { fakeFileBytes, fakeMime, type FakeKind } from "./fake-files";

// A fake Google for tests and browser QA (Integrations PR 1), like the MLS
// mock: a pure Request → Response handler with its state in memory. It covers
// only what the console uses: the consent page (approves at once), the token
// endpoint (code with PKCE, refresh), revoke, userinfo and events on the
// primary calendar. Point GOOGLE_ACCOUNTS_BASE_URL, GOOGLE_OAUTH_BASE_URL and
// GOOGLE_API_BASE_URL at it. The log records request shapes, never bodies or
// tokens. /__fake/* lets a test look inside or simulate a revoked grant.
// Integrations PR 2 adds Drive files (metadata and download), scopes on
// tokens (a refresh can be narrowed), and a stand-in for Google's picker
// script at /picker/api.js that lists the account's files.

export interface FakeGoogleOptions {
  email?: string;
  emailVerified?: boolean;
  clientId?: string;
}

interface FakeEvent {
  id: string;
  account: string;
  body: Record<string, unknown>;
}

export interface FakeGoogle {
  handle(req: Request): Promise<Response>;
  events(account?: string): FakeEvent[];
  log: { method: string; path: string; status: number }[];
  setAccount(email: string, verified?: boolean): void;
  /** Simulates the person removing our access in their Google account. */
  revokeAll(): void;
  /** Makes the next n calls to the events API fail with this status. */
  failNext(n: number, status: number): void;
  /** Adds a Drive file for an account; returns its id. */
  addDriveFile(account: string, name: string, kind: FakeKind): string;
  /** The scopes of every access token issued so far (no token values). */
  issuedScopes(): string[][];
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization", "access-control-allow-methods": "GET, OPTIONS" };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const DRIVE = "https://www.googleapis.com/auth/drive.file";
const id = (prefix: string) => `${prefix}-${randomBytes(9).toString("base64url")}`;

export function createFakeGoogle(opts: FakeGoogleOptions = {}): FakeGoogle {
  let account = { email: opts.email ?? "agent@example.test", verified: opts.emailVerified ?? true };
  const codes = new Map<string, { challenge: string; redirectUri: string; email: string; verified: boolean; scopes: string[] }>();
  const refresh = new Map<string, { email: string; scopes: string[] }>(); // refresh token → account and granted scopes
  const access = new Map<string, { email: string; verified: boolean; scopes: string[] }>();
  const driveFiles = new Map<string, { account: string; name: string; kind: FakeKind }>();
  const issued: string[][] = [];
  const events = new Map<string, FakeEvent>();
  const log: FakeGoogle["log"] = [];
  let failures = { n: 0, status: 500 };

  const issueAccess = (email: string, verified: boolean, scopes: string[]) => {
    const token = id("fake-access");
    access.set(token, { email, verified, scopes });
    issued.push([...scopes]);
    return token;
  };
  const bearer = (req: Request) => access.get((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));

  async function route(req: Request, url: URL): Promise<Response> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/o/oauth2/v2/auth") {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      if (opts.clientId && url.searchParams.get("client_id") !== opts.clientId) return json(400, { error: "invalid_client" });
      if (url.searchParams.get("code_challenge_method") !== "S256" || !url.searchParams.get("code_challenge")) return json(400, { error: "invalid_request" });
      const code = id("fake-code");
      // include_granted_scopes: a new consent keeps what this account granted before.
      const before = [...refresh.values()].filter((r) => r.email === account.email).flatMap((r) => r.scopes);
      const asked = (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean);
      codes.set(code, { challenge: url.searchParams.get("code_challenge")!, redirectUri, email: account.email, verified: account.verified, scopes: [...new Set([...asked, ...before])] });
      const to = new URL(redirectUri);
      to.searchParams.set("code", code);
      to.searchParams.set("state", url.searchParams.get("state") ?? "");
      return new Response(null, { status: 302, headers: { location: to.toString() } });
    }
    if (req.method === "POST" && p === "/token") {
      const f = new URLSearchParams(await req.text());
      if (f.get("grant_type") === "authorization_code") {
        const c = codes.get(f.get("code") ?? "");
        codes.delete(f.get("code") ?? "");
        const verifier = f.get("code_verifier") ?? "";
        if (!c || c.redirectUri !== f.get("redirect_uri") || createHash("sha256").update(verifier).digest("base64url") !== c.challenge) return json(400, { error: "invalid_grant" });
        const rt = id("fake-refresh");
        refresh.set(rt, { email: c.email, scopes: c.scopes });
        return json(200, { access_token: issueAccess(c.email, c.verified, c.scopes), refresh_token: rt, expires_in: 3599, token_type: "Bearer", scope: c.scopes.join(" ") });
      }
      if (f.get("grant_type") === "refresh_token") {
        const r = refresh.get(f.get("refresh_token") ?? "");
        if (!r) return json(400, { error: "invalid_grant" });
        // A refresh may ask for fewer scopes than were granted, never more.
        const want = (f.get("scope") ?? "").split(" ").filter(Boolean);
        if (want.some((x) => !r.scopes.includes(x))) return json(400, { error: "invalid_scope" });
        const scopes = want.length ? want : r.scopes;
        return json(200, { access_token: issueAccess(r.email, true, scopes), expires_in: 3599, token_type: "Bearer", scope: scopes.join(" ") });
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (req.method === "POST" && p === "/revoke") {
      const token = new URLSearchParams(await req.text()).get("token") ?? "";
      if (!refresh.delete(token) && !access.delete(token)) return json(400, { error: "invalid_token" });
      return new Response(null, { status: 200 });
    }
    if (req.method === "GET" && p === "/oauth2/v3/userinfo") {
      const who = bearer(req);
      if (!who) return json(401, { error: "invalid_token" });
      return json(200, { email: who.email, email_verified: who.verified });
    }
    const ev = p.match(/^\/calendar\/v3\/calendars\/primary\/events(?:\/([^/]+))?$/);
    if (ev) {
      const who = bearer(req);
      if (!who) return json(401, { error: { code: 401 } });
      if (failures.n > 0) {
        failures.n--;
        return json(failures.status, { error: { code: failures.status } });
      }
      const eventId = ev[1] ? decodeURIComponent(ev[1]) : null;
      if (req.method === "POST" && !eventId) {
        const e = { id: id("evt"), account: who.email, body: (await req.json()) as Record<string, unknown> };
        events.set(e.id, e);
        return json(200, { id: e.id });
      }
      const e = eventId ? events.get(eventId) : undefined;
      if (!e || e.account !== who.email) return json(404, { error: { code: 404 } });
      if (req.method === "PATCH") {
        e.body = { ...e.body, ...((await req.json()) as Record<string, unknown>) };
        return json(200, { id: e.id });
      }
      if (req.method === "DELETE") {
        events.delete(e.id);
        return new Response(null, { status: 204 });
      }
    }
    const dv = p.match(/^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/);
    if (dv && req.method === "GET") {
      const who = bearer(req);
      if (!who) return json(401, { error: { code: 401 } });
      if (!who.scopes.includes(DRIVE)) return json(403, { error: { code: 403, message: "insufficientPermissions" } });
      const f = driveFiles.get(dv[1]!);
      if (!f || f.account !== who.email) return json(404, { error: { code: 404 } });
      const bytes = fakeFileBytes(f.kind);
      if (url.searchParams.get("alt") === "media") return new Response(bytes, { status: 200, headers: { "content-type": fakeMime[f.kind], "content-length": String(bytes.byteLength) } });
      return json(200, { id: dv[1], name: f.name, mimeType: fakeMime[f.kind], size: String(bytes.byteLength), trashed: false });
    }
    if (p === "/__fake/picker-files") {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      const who = bearer(req);
      // The picker must get a Drive-only token: refuse one that also carries Calendar access.
      if (!who || who.scopes.join(" ") !== DRIVE) return json(403, { error: "picker needs a drive.file-only token" }, CORS);
      return json(200, [...driveFiles.entries()].filter(([, f]) => f.account === who.email).map(([fid, f]) => ({ id: fid, name: f.name, mimeType: fakeMime[f.kind] })), CORS);
    }
    if (p === "/picker/api.js") return new Response(pickerScript(url.origin), { status: 200, headers: { "content-type": "text/javascript", "access-control-allow-origin": "*" } });
    if (p === "/__fake/drive-file" && req.method === "POST") {
      return json(200, { id: addDriveFile(url.searchParams.get("account") ?? account.email, url.searchParams.get("name") ?? "file.pdf", (url.searchParams.get("kind") ?? "pdf") as FakeKind) });
    }
    if (p === "/__fake/scopes") return json(200, issued);
    if (p === "/__fake/events") return json(200, [...events.values()]);
    if (p === "/__fake/revoke-all" && req.method === "POST") {
      refresh.clear();
      access.clear();
      return json(200, {});
    }
    if (p === "/__fake/delete-event" && req.method === "POST") {
      events.delete(url.searchParams.get("id") ?? "");
      return json(200, {});
    }
    if (p === "/__fake/account" && req.method === "POST") {
      account = { email: url.searchParams.get("email") ?? account.email, verified: url.searchParams.get("verified") !== "false" };
      return json(200, {});
    }
    return json(404, { error: "not_found" });
  }

  function addDriveFile(acct: string, name: string, kind: FakeKind): string {
    const fid = `drv${randomBytes(12).toString("base64url")}`;
    driveFiles.set(fid, { account: acct, name, kind });
    return fid;
  }

  return {
    addDriveFile,
    issuedScopes: () => issued.map((x) => [...x]),
    async handle(req) {
      const url = new URL(req.url);
      const res = await route(req, url);
      log.push({ method: req.method, path: url.pathname.replace(/\/events\/[^/]+$/, "/events/:id"), status: res.status });
      return res;
    },
    events: (who) => [...events.values()].filter((e) => !who || e.account === who),
    log,
    setAccount(email, verified = true) {
      account = { email, verified };
    },
    revokeAll() {
      refresh.clear();
      access.clear();
    },
    failNext(n, status) {
      failures = { n, status };
    },
  };
}

/** A fetch that answers from the fake, for unit tests. */
export const fakeFetch = (g: FakeGoogle): typeof fetch => (async (input: string | URL | Request, init?: RequestInit) => g.handle(new Request(input, init))) as typeof fetch;

/**
 * A stand-in for Google's picker (gapi.load("picker") and google.picker.*),
 * enough for the console's import button: a dialog lists the account's files
 * (asked for with the token the console gave it) and returns the ticked ones.
 */
function pickerScript(origin: string): string {
  return `(function () {
  var ORIGIN = ${JSON.stringify(origin)};
  window.gapi = { load: function (name, opts) { (typeof opts === "function" ? opts : opts.callback)(); } };
  window.google = window.google || {};
  function View() { var v = { setIncludeFolders: function () { return v; }, setMimeTypes: function () { return v; }, setSelectFolderEnabled: function () { return v; } }; return v; }
  function show(st) {
    fetch(ORIGIN + "/__fake/picker-files", { headers: { authorization: "Bearer " + st.token } }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); }).then(function (res) {
      var d = document.createElement("div");
      d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Fake Google picker");
      d.style.cssText = "position:fixed;inset:10%;background:#fff;border:2px solid #000;padding:16px;z-index:9999;overflow:auto;color:#000";
      if (!res.ok) { d.textContent = "Fake picker refused the token"; document.body.appendChild(d); st.cb({ action: "cancel" }); return; }
      res.b.forEach(function (f) { var l = document.createElement("label"); l.style.display = "block"; var c = document.createElement("input"); c.type = "checkbox"; c.value = f.id; c.dataset.name = f.name; c.dataset.mime = f.mimeType; l.appendChild(c); l.appendChild(document.createTextNode(" " + f.name)); d.appendChild(l); });
      var ok = document.createElement("button"); ok.type = "button"; ok.textContent = "Select";
      ok.onclick = function () { var docs = []; d.querySelectorAll("input:checked").forEach(function (c) { docs.push({ id: c.value, name: c.dataset.name, mimeType: c.dataset.mime }); }); d.remove(); st.cb({ action: "picked", docs: docs }); };
      var no = document.createElement("button"); no.type = "button"; no.textContent = "Cancel";
      no.onclick = function () { d.remove(); st.cb({ action: "cancel" }); };
      d.appendChild(ok); d.appendChild(no); document.body.appendChild(d); ok.focus();
    });
  }
  window.google.picker = {
    Action: { PICKED: "picked", CANCEL: "cancel" },
    Response: { ACTION: "action", DOCUMENTS: "docs" },
    Document: { ID: "id", NAME: "name", MIME_TYPE: "mimeType" },
    ViewId: { DOCS: "all" },
    Feature: { MULTISELECT_ENABLED: "multi", NAV_HIDDEN: "nav" },
    DocsView: View,
    PickerBuilder: function () {
      var st = {}; var b = {
        addView: function () { return b; }, enableFeature: function () { return b; }, setOAuthToken: function (t) { st.token = t; return b; },
        setDeveloperKey: function () { return b; }, setAppId: function () { return b; }, setCallback: function (cb) { st.cb = cb; return b; },
        setOrigin: function () { return b; }, setTitle: function () { return b; }, setMaxItems: function () { return b; },
        build: function () { return { setVisible: function (v) { if (v) show(st); }, dispose: function () {} }; }
      }; return b;
    }
  };
})();`;
}

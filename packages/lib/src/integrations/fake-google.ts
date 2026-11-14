import { createHash, randomBytes } from "node:crypto";

// A fake Google for tests and browser QA (Integrations PR 1), like the MLS
// mock: a pure Request → Response handler with its state in memory. It covers
// only what the console uses: the consent page (approves at once), the token
// endpoint (code with PKCE, refresh), revoke, userinfo and events on the
// primary calendar. Point GOOGLE_ACCOUNTS_BASE_URL, GOOGLE_OAUTH_BASE_URL and
// GOOGLE_API_BASE_URL at it. The log records request shapes, never bodies or
// tokens. /__fake/* lets a test look inside or simulate a revoked grant.

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
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const id = (prefix: string) => `${prefix}-${randomBytes(9).toString("base64url")}`;

export function createFakeGoogle(opts: FakeGoogleOptions = {}): FakeGoogle {
  let account = { email: opts.email ?? "agent@example.test", verified: opts.emailVerified ?? true };
  const codes = new Map<string, { challenge: string; redirectUri: string; email: string; verified: boolean }>();
  const refresh = new Map<string, string>(); // refresh token → account email
  const access = new Map<string, { email: string; verified: boolean }>();
  const events = new Map<string, FakeEvent>();
  const log: FakeGoogle["log"] = [];
  let failures = { n: 0, status: 500 };

  const issueAccess = (email: string, verified: boolean) => {
    const token = id("fake-access");
    access.set(token, { email, verified });
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
      codes.set(code, { challenge: url.searchParams.get("code_challenge")!, redirectUri, email: account.email, verified: account.verified });
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
        refresh.set(rt, c.email);
        return json(200, { access_token: issueAccess(c.email, c.verified), refresh_token: rt, expires_in: 3599, token_type: "Bearer", scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events" });
      }
      if (f.get("grant_type") === "refresh_token") {
        const email = refresh.get(f.get("refresh_token") ?? "");
        if (!email) return json(400, { error: "invalid_grant" });
        return json(200, { access_token: issueAccess(email, true), expires_in: 3599, token_type: "Bearer" });
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

  return {
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

import { createHash, randomBytes } from "node:crypto";
import { fakeFileBytes, type FakeKind } from "./fake-files";

// A fake Dropbox for tests and browser QA (Integrations PR 2), like the fake
// Google: a pure Request → Response handler with its state in memory. It
// covers only what the console uses: the consent page (approves at once),
// the token endpoint (code with PKCE, refresh), revoke, the current account,
// listing the app folder (with paging) and downloading a file. Point
// DROPBOX_WWW_BASE_URL, DROPBOX_API_BASE_URL and DROPBOX_CONTENT_BASE_URL at
// it. The log records request shapes, never bodies or tokens. /__fake/*
// adds files, simulates a revoked grant or sets the next account.

interface Grant {
  email: string;
  verified: boolean;
}

export interface FakeDropbox {
  handle(req: Request): Promise<Response>;
  log: { method: string; path: string; status: number }[];
  addFile(account: string, name: string, kind: FakeKind): string;
  setAccount(email: string, verified?: boolean): void;
  revokeAll(): void;
  /** Live (not revoked) refresh tokens. */
  liveGrants(): number;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const id = (prefix: string) => `${prefix}${randomBytes(9).toString("base64url")}`;

export function createFakeDropbox(opts: { email?: string; pageSize?: number } = {}): FakeDropbox {
  let account: Grant = { email: opts.email ?? "agent@example.test", verified: true };
  const codes = new Map<string, { challenge: string; redirectUri: string; grant: Grant }>();
  const refresh = new Map<string, Grant>();
  const access = new Map<string, { grant: Grant; refresh: string | null }>();
  const files = new Map<string, { account: string; name: string; kind: FakeKind; modified: string }>();
  const cursors = new Map<string, { account: string; offset: number }>();
  const log: FakeDropbox["log"] = [];
  const pageSize = opts.pageSize ?? 200;

  const bearer = (req: Request) => access.get((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const issue = (grant: Grant, rt: string | null) => {
    const token = id("fake-dbx-access-");
    access.set(token, { grant, refresh: rt });
    return token;
  };
  const page = (who: string, offset: number) => {
    const mine = [...files.entries()].filter(([, f]) => f.account === who);
    const slice = mine.slice(offset, offset + pageSize);
    const more = offset + pageSize < mine.length;
    const cursor = more ? id("cur-") : "";
    if (more) cursors.set(cursor, { account: who, offset: offset + pageSize });
    return {
      entries: slice.map(([fid, f]) => ({ ".tag": "file", id: fid, name: f.name, size: fakeFileBytes(f.kind).byteLength, server_modified: f.modified, path_lower: `/${f.name.toLowerCase()}` })),
      cursor,
      has_more: more,
    };
  };

  async function route(req: Request, url: URL): Promise<Response> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/oauth2/authorize") {
      if (url.searchParams.get("code_challenge_method") !== "S256" || !url.searchParams.get("code_challenge") || url.searchParams.get("token_access_type") !== "offline") return json(400, { error: "invalid_request" });
      const code = id("fake-dbx-code-");
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      codes.set(code, { challenge: url.searchParams.get("code_challenge")!, redirectUri, grant: { ...account } });
      const to = new URL(redirectUri);
      to.searchParams.set("code", code);
      to.searchParams.set("state", url.searchParams.get("state") ?? "");
      return new Response(null, { status: 302, headers: { location: to.toString() } });
    }
    if (req.method === "POST" && p === "/oauth2/token") {
      const f = new URLSearchParams(await req.text());
      if (f.get("grant_type") === "authorization_code") {
        const c = codes.get(f.get("code") ?? "");
        codes.delete(f.get("code") ?? "");
        if (!c || c.redirectUri !== f.get("redirect_uri") || createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") !== c.challenge) return json(400, { error: "invalid_grant" });
        const rt = id("fake-dbx-refresh-");
        refresh.set(rt, c.grant);
        return json(200, { access_token: issue(c.grant, rt), refresh_token: rt, expires_in: 14400, token_type: "bearer", scope: "account_info.read files.content.read files.metadata.read" });
      }
      if (f.get("grant_type") === "refresh_token") {
        const rt = f.get("refresh_token") ?? "";
        const g = refresh.get(rt);
        if (!g) return json(400, { error: "invalid_grant" });
        return json(200, { access_token: issue(g, rt), expires_in: 14400, token_type: "bearer" });
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    const who = bearer(req);
    if (req.method === "POST" && p === "/2/auth/token/revoke") {
      if (!who) return json(401, { error: "invalid_access_token" });
      if (who.refresh) refresh.delete(who.refresh);
      for (const [t, a] of access) if (a.refresh === who.refresh) access.delete(t);
      return json(200, null);
    }
    if (req.method === "POST" && p === "/2/users/get_current_account") {
      if (!who) return json(401, { error: "invalid_access_token" });
      return json(200, { email: who.grant.email, email_verified: who.grant.verified, account_id: "dbid:fictional" });
    }
    if (req.method === "POST" && p === "/2/files/list_folder") {
      if (!who) return json(401, { error: "invalid_access_token" });
      const body = (await req.json()) as { path?: string };
      if (body.path !== "") return json(409, { error_summary: "path/not_found/" });
      return json(200, page(who.grant.email, 0));
    }
    if (req.method === "POST" && p === "/2/files/list_folder/continue") {
      if (!who) return json(401, { error: "invalid_access_token" });
      const c = cursors.get(((await req.json()) as { cursor?: string }).cursor ?? "");
      if (!c || c.account !== who.grant.email) return json(409, { error_summary: "reset/" });
      return json(200, page(c.account, c.offset));
    }
    if (req.method === "POST" && p === "/2/files/download") {
      if (!who) return json(401, { error: "invalid_access_token" });
      let arg: { path?: string } = {};
      try {
        arg = JSON.parse(req.headers.get("dropbox-api-arg") ?? "{}");
      } catch {
        return json(400, { error: "bad arg" });
      }
      const f = files.get(arg.path ?? "");
      if (!f || f.account !== who.grant.email) return json(409, { error_summary: "path/not_found/" });
      const bytes = fakeFileBytes(f.kind);
      return new Response(bytes as unknown as ConstructorParameters<typeof Response>[0], { status: 200, headers: { "content-type": "application/octet-stream", "content-length": String(bytes.byteLength), "dropbox-api-result": JSON.stringify({ id: arg.path, name: f.name, size: bytes.byteLength }) } });
    }
    if (p === "/__fake/file" && req.method === "POST") {
      const fid = addFile(url.searchParams.get("account") ?? account.email, url.searchParams.get("name") ?? "file.pdf", (url.searchParams.get("kind") ?? "pdf") as FakeKind);
      return json(200, { id: fid });
    }
    if (p === "/__fake/revoke-all" && req.method === "POST") {
      refresh.clear();
      access.clear();
      return json(200, {});
    }
    if (p === "/__fake/account" && req.method === "POST") {
      account = { email: url.searchParams.get("email") ?? account.email, verified: url.searchParams.get("verified") !== "false" };
      return json(200, {});
    }
    if (p === "/__fake/grants") return json(200, { live: refresh.size });
    return json(404, { error: "not_found" });
  }

  function addFile(acct: string, name: string, kind: FakeKind): string {
    const fid = id("id:");
    files.set(fid, { account: acct, name, kind, modified: new Date(Date.now() + files.size * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") });
    return fid;
  }

  return {
    async handle(req) {
      const url = new URL(req.url);
      const res = await route(req, url);
      log.push({ method: req.method, path: url.pathname, status: res.status });
      return res;
    },
    log,
    addFile,
    setAccount(email, verified = true) {
      account = { email, verified };
    },
    revokeAll() {
      refresh.clear();
      access.clear();
    },
    liveGrants: () => refresh.size,
  };
}

/** A fetch that answers from the fake, for unit tests. */
export const fakeDropboxFetch = (d: FakeDropbox): typeof fetch => (async (input: string | URL | Request, init?: RequestInit) => d.handle(new Request(input, init))) as typeof fetch;

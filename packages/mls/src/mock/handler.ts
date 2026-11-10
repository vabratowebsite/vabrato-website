import { MOCK_MEDIA_ORIGIN } from "../fixtures";
import { RESOURCE_KEYS, RESOURCE_NAMES, type ResourceName } from "../resources";
import { MockFeed } from "./feed";
import { evaluate, FilterError, parseFilter } from "./filter";

// Mock MLSListings RESO Web API. One pure handler (WHATWG Request -> Response)
// shared by the in-process fetch (tests, MLS_MODE=mock) and the HTTP server
// (`pnpm --filter @vabrato/mls mock`). Supports what the client uses:
// OAuth2 client credentials, $filter/$select/$orderby/$top/$skip/$count,
// server-side page caps with @odata.nextLink, and fault injection.

export const MOCK_BASE_PATH = "/reso/odata";
export const MOCK_TOKEN_PATH = "/oauth/token";
export const MOCK_CLIENT_ID = "mock-client";
// Not a secret: a fixed value only the mock accepts.
export const MOCK_CLIENT_SECRET = "mock-secret-not-a-real-credential";

export interface Fault {
  status: number;
  retryAfter?: string;
  /** Only requests whose path contains this. */
  pathIncludes?: string;
  times?: number;
}

export interface MockOptions {
  feed?: MockFeed;
  /** Server-side cap on $top. */
  maxPageSize?: number;
  tokenTtlSec?: number;
  /** Rewrite fixture media URLs to this origin (HTTP server mode). */
  publicOrigin?: string;
  /** Omit @odata.nextLink, so clients must fall back to $skip paging. */
  omitNextLink?: boolean;
}

export interface MockRequestLog {
  method: string;
  path: string;
  params: Record<string, string>;
  authorized: boolean;
}

export interface MockHandler {
  (req: Request): Promise<Response>;
  feed: MockFeed;
  requests: MockRequestLog[];
  injectFault(f: Fault): void;
  revokeTokens(): void;
  tokensIssued(): number;
}

type Rec = Record<string, unknown>;

export function createMockHandler(opts: MockOptions = {}): MockHandler {
  const feed = opts.feed ?? new MockFeed();
  const maxPage = opts.maxPageSize ?? 100;
  const ttl = opts.tokenTtlSec ?? 3600;
  const tokens = new Set<string>();
  let issued = 0;
  const faults: (Fault & { times: number })[] = [];
  const requests: MockRequestLog[] = [];

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const odataError = (status: number, message: string) => json(status, { error: { code: String(status), message } });

  async function token(req: Request): Promise<Response> {
    const form = new URLSearchParams(await req.text());
    if (form.get("grant_type") !== "client_credentials") return json(400, { error: "unsupported_grant_type" });
    if (form.get("client_id") !== MOCK_CLIENT_ID || form.get("client_secret") !== MOCK_CLIENT_SECRET) {
      return json(401, { error: "invalid_client" });
    }
    const value = `mock-token-${++issued}`;
    tokens.add(value);
    return json(200, { access_token: value, token_type: "Bearer", expires_in: ttl });
  }

  function placeholderSvg(key: string): Response {
    const label = key.replace(/[^A-Za-z0-9-]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#d9dbe4"/><text x="600" y="400" font-family="sans-serif" font-size="48" text-anchor="middle" fill="#151B5C">Fictional fixture photo ${label}</text></svg>`;
    return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml" } });
  }

  function sortRecords(list: Rec[], orderby: string | null, keyField: string): Rec[] {
    const clauses = (orderby ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [field, dir] = s.split(/\s+/);
        return { field: field!, desc: dir === "desc" };
      });
    clauses.push({ field: keyField, desc: false });
    return [...list].sort((a, b) => {
      for (const c of clauses) {
        const x = a[c.field] as string | number | null | undefined;
        const y = b[c.field] as string | number | null | undefined;
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * (c.desc ? -1 : 1);
      }
      return 0;
    });
  }

  function query(url: URL, resource: ResourceName): Response {
    const p = url.searchParams;
    let list = feed.records(resource);
    const filter = p.get("$filter");
    if (filter) {
      try {
        const node = parseFilter(filter);
        list = list.filter((r) => evaluate(node, r));
      } catch (e) {
        if (e instanceof FilterError) return odataError(400, `Invalid $filter: ${e.message}`);
        throw e;
      }
    }
    list = sortRecords(list, p.get("$orderby"), RESOURCE_KEYS[resource]);
    const total = list.length;
    const skip = Number(p.get("$skip") ?? 0);
    const top = Math.min(Number(p.get("$top") ?? maxPage), maxPage);
    if (!Number.isInteger(skip) || skip < 0 || !Number.isInteger(top) || top < 0) return odataError(400, "Invalid $top/$skip");
    const page = list.slice(skip, skip + top);
    const select = p.get("$select")?.split(",").map((s) => s.trim());
    const value = page.map((r) => {
      const out: Rec = select ? Object.fromEntries(select.filter((f) => f in r).map((f) => [f, r[f]])) : { ...r };
      if (opts.publicOrigin && typeof out.MediaURL === "string") {
        out.MediaURL = out.MediaURL.replace(MOCK_MEDIA_ORIGIN, opts.publicOrigin);
      }
      return out;
    });
    const body: Rec = { "@odata.context": `${url.origin}${MOCK_BASE_PATH}/$metadata#${resource}`, value };
    if (p.get("$count") === "true") body["@odata.count"] = total;
    if (!opts.omitNextLink && skip + top < total) {
      const next = new URL(url);
      next.searchParams.set("$skip", String(skip + top));
      next.searchParams.set("$top", String(top));
      body["@odata.nextLink"] = next.toString();
    }
    return json(200, body);
  }

  const handler = (async (req: Request) => {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    const authorized = Boolean(auth?.startsWith("Bearer ") && tokens.has(auth.slice(7)));
    requests.push({ method: req.method, path: url.pathname, params: Object.fromEntries(url.searchParams), authorized });

    const fault = faults.find((f) => !f.pathIncludes || url.pathname.includes(f.pathIncludes));
    if (fault) {
      if (--fault.times <= 0) faults.splice(faults.indexOf(fault), 1);
      const headers: Record<string, string> = fault.retryAfter ? { "retry-after": fault.retryAfter } : {};
      return json(fault.status, { error: { code: String(fault.status), message: "Injected fault" } }, headers);
    }

    if (url.pathname === MOCK_TOKEN_PATH && req.method === "POST") return token(req);

    const media = /^\/media\/([A-Za-z0-9-]+)\.svg$/.exec(url.pathname);
    if (media && req.method === "GET") return placeholderSvg(media[1]!);

    if (url.pathname.startsWith(MOCK_BASE_PATH + "/") && req.method === "GET") {
      if (!authorized) return odataError(401, "Missing or invalid bearer token");
      const resource = url.pathname.slice(MOCK_BASE_PATH.length + 1);
      if (!(RESOURCE_NAMES as readonly string[]).includes(resource)) return odataError(404, "Unknown resource");
      return query(url, resource as ResourceName);
    }
    return odataError(404, "Not found");
  }) as MockHandler;

  handler.feed = feed;
  handler.requests = requests;
  handler.injectFault = (f) => faults.push({ ...f, times: f.times ?? 1 });
  handler.revokeTokens = () => tokens.clear();
  handler.tokensIssued = () => issued;
  return handler;
}

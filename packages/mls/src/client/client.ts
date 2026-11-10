import { RESOURCE_KEYS, RESOURCE_SCHEMAS, type ResourceName, type ResourceRecord } from "../resources";
import { queryString, type ODataQuery } from "./odata";

// RESO Web API client: OAuth2 client credentials, rate limiting, retries with
// backoff, and OData paging. Transport-agnostic (inject `fetch`), so the same
// code talks to the mock (in-process or HTTP) and to MLSListings.
//
// Never logs or throws credentials, tokens or record contents.

export interface ClientCredentials {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

export interface RetryOptions {
  /** Total attempts per request, including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Longest Retry-After we wait for; anything longer fails the request (the next run retries). */
  maxRetryAfterMs: number;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export type ClientEvent =
  | { type: "retry"; resource: string; attempt: number; status?: number; delayMs: number }
  | { type: "token_refreshed" }
  | { type: "invalid_record"; resource: string; key: string | null };

export interface ResoClientOptions {
  /** Service root, e.g. https://api.example/reso/odata (no trailing slash needed). */
  baseUrl: string;
  fetch?: typeof fetch;
  /** Omit for servers that need no auth. */
  auth?: ClientCredentials;
  rateLimitPerSec?: number;
  retry?: Partial<RetryOptions>;
  /** Records per page ($top). Servers may return fewer and a nextLink. */
  pageSize?: number;
  /** Safety stop for runaway paging. */
  maxPages?: number;
  clock?: Clock;
  random?: () => number;
  onEvent?: (e: ClientEvent) => void;
}

export class ResoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ResoError";
  }
}

export const DEFAULT_RETRY: RetryOptions = { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 30_000, maxRetryAfterMs: 60_000 };

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export interface ResoClient {
  /** Validated records, page by page. Invalid records are skipped and reported via onEvent. */
  records<R extends ResourceName>(resource: R, query?: ODataQuery): AsyncGenerator<ResourceRecord<R>>;
  all<R extends ResourceName>(resource: R, query?: ODataQuery): Promise<ResourceRecord<R>[]>;
  /** Raw GET of an absolute URL on the API origin (e.g. a media file). */
  fetchBinary(url: string): Promise<{ bytes: Uint8Array; contentType: string }>;
}

export function createResoClient(opts: ResoClientOptions): ResoClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const clock = opts.clock ?? realClock;
  const random = opts.random ?? Math.random;
  const retry = { ...DEFAULT_RETRY, ...opts.retry };
  const pageSize = opts.pageSize ?? 200;
  const maxPages = opts.maxPages ?? 10_000;
  const base = opts.baseUrl.replace(/\/+$/, "");
  const baseOrigin = new URL(base).origin;
  const emit = opts.onEvent ?? (() => {});

  // Rate limiter: requests start at least 1/rate seconds apart.
  const interval = 1000 / (opts.rateLimitPerSec ?? 2);
  let nextSlot = 0;
  async function takeSlot() {
    const now = clock.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + interval;
    if (wait > 0) await clock.sleep(wait);
  }

  let token: { value: string; expiresAt: number } | null = null;
  async function getToken(): Promise<string | null> {
    if (!opts.auth) return null;
    if (token && token.expiresAt > clock.now()) return token.value;
    const { tokenUrl, clientId, clientSecret, scope } = opts.auth;
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
    if (scope) body.set("scope", scope);
    await takeSlot();
    let res: Response;
    try {
      res = await doFetch(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body,
      });
    } catch {
      throw new ResoError("MLS token request failed (network error)");
    }
    // Never include the response body: some servers echo the request.
    if (!res.ok) throw new ResoError(`MLS token request failed (status ${res.status})`, res.status);
    const json = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!json || typeof json.access_token !== "string") throw new ResoError("MLS token response had no access_token");
    const ttl = typeof json.expires_in === "number" ? json.expires_in : 3600;
    token = { value: json.access_token, expiresAt: clock.now() + Math.max(0, ttl - 60) * 1000 };
    return token.value;
  }

  function backoff(attempt: number): number {
    const exp = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1));
    return Math.round(exp * (0.5 + random() * 0.5));
  }

  function retryAfterMs(res: Response): number | null {
    const h = res.headers.get("retry-after");
    if (!h) return null;
    const secs = Number(h);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const at = Date.parse(h);
    return Number.isNaN(at) ? null : Math.max(0, at - clock.now());
  }

  /** GET with auth, rate limit and retries. `label` is what errors and events mention (never the full URL). */
  async function get(url: string, label: string, accept = "application/json"): Promise<Response> {
    // The token goes only to the API origin (media may live on a CDN).
    const withAuth = new URL(url).origin === baseOrigin;
    let refreshedToken = false;
    for (let attempt = 1; ; attempt++) {
      const bearer = withAuth ? await getToken() : null;
      await takeSlot();
      let res: Response;
      try {
        res = await doFetch(url, { headers: { accept, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } });
      } catch {
        if (attempt >= retry.maxAttempts) throw new ResoError(`${label}: network error after ${attempt} attempts`);
        const delayMs = backoff(attempt);
        emit({ type: "retry", resource: label, attempt, delayMs });
        await clock.sleep(delayMs);
        continue;
      }
      if (res.status === 401 && withAuth && opts.auth && !refreshedToken) {
        // Token revoked or expired early: get a new one and try again once.
        refreshedToken = true;
        token = null;
        emit({ type: "token_refreshed" });
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retry.maxAttempts) throw new ResoError(`${label}: status ${res.status} after ${attempt} attempts`, res.status);
        const ra = retryAfterMs(res);
        if (ra !== null && ra > retry.maxRetryAfterMs) {
          throw new ResoError(`${label}: rate limited, Retry-After exceeds ${retry.maxRetryAfterMs} ms`, res.status);
        }
        const delayMs = ra ?? backoff(attempt);
        emit({ type: "retry", resource: label, attempt, status: res.status, delayMs });
        await clock.sleep(delayMs);
        continue;
      }
      if (!res.ok) throw new ResoError(`${label}: status ${res.status}`, res.status);
      return res;
    }
  }

  function resolveNext(next: string): string {
    const url = new URL(next, base + "/");
    // Only follow links on the API origin, so a bad nextLink can't send our token elsewhere.
    if (url.origin !== baseOrigin) throw new ResoError("nextLink points outside the API origin");
    return url.toString();
  }

  async function* pages(resource: ResourceName, query: ODataQuery): AsyncGenerator<unknown[]> {
    const top = query.top ?? pageSize;
    let skip = query.skip ?? 0;
    let url: string | null = `${base}/${resource}?${queryString({ ...query, top, skip: skip || undefined })}`;
    let count = 0;
    while (url) {
      if (++count > maxPages) throw new ResoError(`${resource}: more than ${maxPages} pages`);
      const res = await get(url, resource);
      const body = (await res.json()) as { value?: unknown; "@odata.nextLink"?: unknown };
      if (!Array.isArray(body.value)) throw new ResoError(`${resource}: response has no value array`);
      yield body.value;
      const next = body["@odata.nextLink"];
      if (typeof next === "string" && next) {
        url = resolveNext(next);
      } else if (body.value.length === top && top > 0) {
        // Server pages with $skip but sends no nextLink.
        skip += top;
        url = `${base}/${resource}?${queryString({ ...query, top, skip })}`;
      } else {
        url = null;
      }
    }
  }

  async function* records<R extends ResourceName>(resource: R, query: ODataQuery = {}): AsyncGenerator<ResourceRecord<R>> {
    const schema = RESOURCE_SCHEMAS[resource];
    for await (const page of pages(resource, query)) {
      for (const raw of page) {
        const parsed = schema.safeParse(raw);
        if (parsed.success) {
          yield parsed.data as ResourceRecord<R>;
        } else {
          const key = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[RESOURCE_KEYS[resource]] : null;
          emit({ type: "invalid_record", resource, key: typeof key === "string" ? key : null });
        }
      }
    }
  }

  return {
    records,
    async all(resource, query) {
      const out = [];
      for await (const r of records(resource, query)) out.push(r);
      return out;
    },
    async fetchBinary(url) {
      const res = await get(url, "media file", "*/*");
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") ?? "application/octet-stream",
      };
    },
  };
}

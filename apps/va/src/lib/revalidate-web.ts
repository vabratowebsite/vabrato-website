// Tells the website to drop its cached content after a publish (apps/web
// /api/revalidate, tag "content"). Retries a few times; if it still fails the
// site catches up within its 15-minute cache, and the caller says so.

export interface RevalidateOptions {
  url?: string;
  secret?: string;
  tag?: "content" | "mls";
  tries?: number;
  doFetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export type RevalidateResult = "done" | "failed" | "not_configured";

export async function revalidateWebsite(opts: RevalidateOptions = {}): Promise<RevalidateResult> {
  const url = opts.url ?? process.env.WEB_REVALIDATE_URL;
  const secret = opts.secret ?? process.env.REVALIDATE_SECRET;
  if (!url || !secret) return "not_configured";
  const doFetch = opts.doFetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const tries = opts.tries ?? 3;
  const target = new URL(url);
  target.searchParams.set("tag", opts.tag ?? "content");
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await doFetch(target, { method: "POST", headers: { "x-revalidate-secret": secret }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (res.ok) return "done";
      // A wrong secret or a missing route won't fix itself.
      if (res.status === 401 || res.status === 404 || res.status === 400) return "failed";
    } catch {
      // Network error or timeout: retry.
    }
    if (attempt < tries) await sleep(500 * 2 ** (attempt - 1));
  }
  return "failed";
}

export function revalidateNote(result: RevalidateResult): string {
  if (result === "done") return "The website is updated.";
  return "The website will show it within 15 minutes.";
}

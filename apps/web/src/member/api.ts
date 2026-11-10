import { NextResponse } from "next/server";
import { getMember } from "./session";

// Helpers for /api/my/* route handlers (review item 7): every response is
// private and never cached; writes must come from our own pages (Origin
// check, plus SameSite cookies); the member is read from the session.

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * True when a state-changing request comes from this site. Browsers send
 * Origin on POST/PUT/PATCH/DELETE; requests without one (or from elsewhere)
 * are refused.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function apiMember() {
  return getMember();
}

/** Server log for a failed member query: route and error code only, never member data. */
export function logDbError(route: string, error: { code?: string; message?: string } | null) {
  if (error) console.error("member api", { route, code: error.code ?? "unknown" });
}

export const unauthorized = () => json({ error: "signed_out" }, 401);
export const forbiddenOrigin = () => json({ error: "bad_origin" }, 403);

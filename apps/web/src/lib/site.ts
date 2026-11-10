// apps/web serves two sites from one codebase (SPEC G2):
//   - vabrato.com: public site and member portal
//   - homes.sancarloslife.com: San Carlos IDX listings only
// Routing is by request host. Anything unknown (localhost, Vercel previews)
// falls back to the main site.

export type Site = "vabrato" | "sancarloslife";

const SANCARLOSLIFE_HOSTS = new Set(["homes.sancarloslife.com"]);

export function siteForHost(host: string | null | undefined): Site {
  if (!host) return "vabrato";
  const hostname = host.toLowerCase().split(":")[0] ?? "";
  if (SANCARLOSLIFE_HOSTS.has(hostname) || hostname.startsWith("sancarloslife.")) {
    return "sancarloslife";
  }
  return "vabrato";
}

/** Internal path prefix of the homes.sancarloslife.com pages (app/(sancarloslife)/scl). */
export const SCL_PREFIX = "/scl";

/**
 * Where a request should go:
 *   - "next": serve as is
 *   - "not-found": 404
 *   - { rewrite }: serve another internal path
 * The SCL host only ever reaches the /scl pages; vabrato.com never does.
 */
export function routeForSite(site: Site, pathname: string): "next" | "not-found" | { rewrite: string } {
  const isScl = pathname === SCL_PREFIX || pathname.startsWith(`${SCL_PREFIX}/`);
  if (site === "vabrato") return isScl ? "not-found" : "next";
  if (isScl) return "not-found";
  return { rewrite: pathname === "/" ? SCL_PREFIX : `${SCL_PREFIX}${pathname}` };
}

/** Paths that need the member session (refreshed by middleware). */
export const MEMBER_PATH_PREFIXES = ["/my", "/auth", "/api/my"] as const;

export function isMemberPath(pathname: string): boolean {
  return MEMBER_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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

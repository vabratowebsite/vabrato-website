import { NextResponse, type NextRequest } from "next/server";
import { routeForSite, siteForHost } from "@/lib/site";

// Host-based routing (SPEC G2, src/lib/site.ts). homes.sancarloslife.com is
// served from app/(sancarloslife)/scl, which itself returns 404 while the
// `site_scl_enabled` flag is off (review item 1).
export function middleware(req: NextRequest) {
  const route = routeForSite(siteForHost(req.headers.get("host")), req.nextUrl.pathname);
  if (route === "next") return NextResponse.next();
  if (route === "not-found") return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  const url = req.nextUrl.clone();
  url.pathname = route.rewrite;
  return NextResponse.rewrite(url);
}

export const config = {
  // Static assets, image optimizer and metadata files are served as is.
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@vabrato/lib/auth/middleware";
import { isMemberPath, routeForSite, siteForHost } from "@/lib/site";

// Host-based routing (SPEC G2, src/lib/site.ts). homes.sancarloslife.com is
// served from app/(sancarloslife)/scl, which itself returns 404 while the
// `site_scl_enabled` flag is off (review item 1).
//
// The Supabase session is refreshed on member paths only (/my, /auth,
// /api/my): public pages stay static and make no Auth call per view.
export async function middleware(req: NextRequest) {
  const site = siteForHost(req.headers.get("host"));
  const route = routeForSite(site, req.nextUrl.pathname);
  if (route === "next") {
    if (site === "vabrato" && isMemberPath(req.nextUrl.pathname)) {
      const res = await updateSession(req);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
    return NextResponse.next();
  }
  if (route === "not-found") return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  const url = req.nextUrl.clone();
  url.pathname = route.rewrite;
  return NextResponse.rewrite(url);
}

export const config = {
  // Static assets, image optimizer and metadata files are served as is.
  matcher: ["/((?!_next/|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"],
};

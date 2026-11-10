import { headers } from "next/headers";
import { NotFoundBody } from "@/components/NotFoundBody";
import { SiteChrome } from "@/components/SiteChrome";
import { siteForHost } from "@/lib/site";

// URLs that match no route render outside any route group. On vabrato.com
// this adds the site chrome (footer disclosure and Equal Housing logo). On
// homes.sancarloslife.com (unknown paths, or the whole host while
// `site_scl_enabled` is off) it shows a bare page whose links work there.
export const metadata = { title: "Page not found | Vabrato", robots: { index: false, follow: false } };

export default async function RootNotFound() {
  const site = siteForHost((await headers()).get("host"));
  if (site === "sancarloslife") {
    return (
      <main id="main" className="flex-1">
        <NotFoundBody site="sancarloslife" />
      </main>
    );
  }
  return (
    <SiteChrome>
      <NotFoundBody />
    </SiteChrome>
  );
}

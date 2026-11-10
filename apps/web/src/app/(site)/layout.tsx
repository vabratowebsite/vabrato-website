import type { ReactNode } from "react";
import { Footer, SiteHeader } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { FOOTER_NAV, MAIN_NAV } from "@/lib/nav";
import { BROKER_DISCLOSURE, ORG, ORG_ADDRESS_LINE } from "@/lib/org";
import { organizationJsonLd } from "@/lib/seo";

// vabrato.com chrome. Every page gets the broker disclosure and the Equal
// Housing Opportunity logo in the footer (review item 2). Pages that show MLS
// data add <MlsAttribution> themselves (MLS-1).

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-navy"
      >
        Skip to content
      </a>
      <SiteHeader nav={MAIN_NAV} signInHref="/join" joinHref="/join" searchHref="/search" />
      <main id="main">{children}</main>
      <Footer
        phones={ORG.phones.map((p) => ({ label: p.label, number: p.number }))}
        address={ORG_ADDRESS_LINE}
        dre={BROKER_DISCLOSURE}
        nav={FOOTER_NAV}
      />
      <JsonLd data={organizationJsonLd()} />
    </>
  );
}

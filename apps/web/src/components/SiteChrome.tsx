import type { ReactNode } from "react";
import { Footer } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { MemberAwareHeader } from "@/member/components/MemberAwareHeader";
import { MemberQueryProvider } from "@/member/components/MemberQueryProvider";
import { FOOTER_NAV, MAIN_NAV } from "@/lib/nav";
import { BROKER_DISCLOSURE, ORG, ORG_ADDRESS_LINE } from "@/lib/org";
import { organizationJsonLd } from "@/lib/seo";

// vabrato.com chrome. Every page gets the broker disclosure and the Equal
// Housing Opportunity logo in the footer (review item 2). Pages that show MLS
// data add <MlsAttribution> themselves (MLS-1). Shared by the (site) layout
// and the root not-found page, which renders outside any route group.

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <MemberQueryProvider>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
      >
        Skip to content
      </a>
      <MemberAwareHeader nav={MAIN_NAV} signInHref="/sign-in" joinHref="/join" searchHref="/search" />
      <main id="main" className="flex-1">{children}</main>
      <Footer
        phones={ORG.phones.map((p) => ({ label: p.label, number: p.number }))}
        address={ORG_ADDRESS_LINE}
        dre={BROKER_DISCLOSURE}
        nav={FOOTER_NAV}
      />
      <JsonLd data={organizationJsonLd()} />
    </MemberQueryProvider>
  );
}

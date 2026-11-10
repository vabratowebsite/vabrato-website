import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EqualHousingIcon, Logo } from "@vabrato/ui/web";
import { flagEnabled } from "@/lib/public/listings";
import { BROKER_DISCLOSURE, ORG, ORG_ADDRESS_LINE, SITE_URL } from "@/lib/org";

// homes.sancarloslife.com (SPEC G2): San Carlos IDX listings only,
// Vabrato-branded. Off (404, no MLS data) until `site_scl_enabled` is on
// (review item 1). Links to anything else go to vabrato.com.
export const revalidate = 900;

export default async function SclLayout({ children }: { children: ReactNode }) {
  if (!(await flagEnabled("site_scl_enabled"))) notFound();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-navy">
        Skip to content
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-site flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href="/" className="flex items-center gap-4">
            <Logo />
            <span className="font-body text-label uppercase tracking-label text-navy">San Carlos homes for sale</span>
          </Link>
          <nav aria-label="Site">
            <ul className="flex flex-wrap gap-6 font-body text-label uppercase tracking-label">
              <li>
                <Link href="/" className="text-navy hover:underline">
                  San Carlos listings
                </Link>
              </li>
              <li>
                <a href={`${SITE_URL}/search`} className="text-navy hover:underline">
                  All Peninsula homes
                </a>
              </li>
              <li>
                <a href={`${SITE_URL}/contact`} className="text-navy hover:underline">
                  Contact Vabrato
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="bg-navy-deep text-white">
        <div className="mx-auto max-w-site space-y-4 px-4 py-10 text-center font-body text-body-sm md:px-6">
          <section aria-label="Broker disclosure" className="space-y-1">
            <p>This listings section is provided by {ORG.name}, a licensed California real estate broker.</p>
            <p>{BROKER_DISCLOSURE}</p>
            <p>{ORG_ADDRESS_LINE}</p>
          </section>
          <p className="text-white/85">
            <a href={`${SITE_URL}/privacy`} className="underline">
              Privacy
            </a>{" "}
            ·{" "}
            <a href={`${SITE_URL}/terms`} className="underline">
              Terms
            </a>{" "}
            ·{" "}
            <a href={`${SITE_URL}/accessibility`} className="underline">
              Accessibility
            </a>
          </p>
          <div className="flex items-center justify-center gap-3 text-caption text-white/80">
            <EqualHousingIcon size={24} />
            <span>© {new Date().getFullYear()} {ORG.name}. Equal Housing Opportunity.</span>
          </div>
        </div>
      </footer>
    </>
  );
}

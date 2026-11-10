import { Button, SectionTitle } from "@vabrato/ui/web";
import { SITE_URL } from "@/lib/org";

// Branded "not found" body. Listings that leave the feed land here too
// (review item 6), so the copy doesn't imply the visitor made a mistake.
// The homes.sancarloslife.com variant only links to pages that exist on that
// host (its San Carlos listings) and to vabrato.com.
export function NotFoundBody({ site = "vabrato" }: { site?: "vabrato" | "sancarloslife" }) {
  const links =
    site === "sancarloslife"
      ? { primary: { label: "San Carlos listings", href: "/" }, secondary: { label: "Contact Vabrato", href: `${SITE_URL}/contact` } }
      : { primary: { label: "Search homes", href: "/search" }, secondary: { label: "Contact an agent", href: "/contact" } };
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-20 text-center md:px-6">
      <p className="font-body text-label uppercase tracking-label text-gold-ink">Page not found</p>
      <SectionTitle as="h1" title="We couldn't find that page" hairline={false} />
      <p className="font-body text-body-lg text-ink">
        The page may have moved, or the home is no longer on the market. {site === "sancarloslife" ? "See current San Carlos listings" : "Search current listings"} or
        ask one of our agents.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Button href={links.primary.href} variant="navy" underline={false}>
          {links.primary.label}
        </Button>
        <Button href={links.secondary.href}>{links.secondary.label}</Button>
      </div>
    </div>
  );
}

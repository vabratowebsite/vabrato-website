import { Button, SectionTitle } from "@vabrato/ui/web";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Buy a home on the Peninsula | Vabrato",
  description: "Search homes, visit open houses and tour with a Vabrato agent in San Mateo and Santa Clara Counties.",
  path: "/buy",
});

export default function BuyPage() {
  return (
    <div className="mx-auto max-w-site space-y-10 px-4 py-12 md:px-6">
      <SectionTitle as="h1" title="Buying with Vabrato" eyebrow="San Mateo and Santa Clara Counties" />
      <p className="max-w-prose font-body text-body-lg text-ink">
        PLACEHOLDER: buyer services copy (content checklist). Search every home for sale in both counties, see open houses, and request a private tour
        from any listing.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button href="/search" variant="navy" underline={false}>
          Search homes
        </Button>
        <Button href="/open-houses">See open houses</Button>
        <Button href="/join">Create a free account</Button>
      </div>
    </div>
  );
}

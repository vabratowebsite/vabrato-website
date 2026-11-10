import { Button, SectionTitle } from "@vabrato/ui/web";
import { pageMetadata } from "@/lib/seo";

// Stub until S5 builds accounts (magic link + Google, VOW Terms of Use).
export const metadata = { ...pageMetadata({ title: "Free accounts are coming | Vabrato", description: "Free Vabrato member accounts are coming soon.", path: "/join" }), robots: { index: false, follow: false } };

export default function JoinPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 text-center md:px-6">
      <SectionTitle as="h1" title="Free accounts are coming" hairline={false} />
      <p className="font-body text-body-lg text-ink">
        Soon you&apos;ll be able to save homes and searches, get alerts, and see sold prices and price history. Until then, our agents are happy to help directly.
      </p>
      <div className="flex justify-center gap-4">
        <Button href="/contact" variant="navy" underline={false}>
          Contact an agent
        </Button>
        <Button href="/search">Search homes</Button>
      </div>
    </div>
  );
}

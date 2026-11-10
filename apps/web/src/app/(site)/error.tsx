"use client";

import { Button, SectionTitle } from "@vabrato/ui/web";

// Shown when a data read fails (the data layer throws instead of returning an
// empty list that would look like "no homes"). No error details reach the page.
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-20 text-center md:px-6" role="alert">
      <SectionTitle as="h1" title="Something went wrong" hairline={false} />
      <p className="font-body text-body-lg text-ink">We couldn&apos;t load this page just now. Please try again in a moment.</p>
      <div className="flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="bg-navy px-6 py-3 font-body text-label uppercase tracking-label text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Try again
        </button>
        <Button href="/contact">Contact us</Button>
      </div>
    </div>
  );
}

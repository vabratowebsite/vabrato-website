import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadForm } from "@/components/forms/LeadForm";
import { MlsAttribution } from "@/components/MlsAttribution";
import { openHouseLong } from "@/lib/listing-view";
import { mlsLastUpdated, openHouseSigninInfo } from "@/lib/public/listings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Open house sign-in | Vabrato", robots: { index: false, follow: false } };

// Open-house sign-in for the agent's tablet (review item 10). Works only with
// the event's link from the agent console, and only on the day of the open
// house. The street shows only when the listing allows it.
export default async function OpenHouseSignIn({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [event, lastUpdated] = await Promise.all([openHouseSigninInfo(token), mlsLastUpdated()]);
  if (!event) notFound();
  const place = [event.street, event.city].filter(Boolean).join(", ") || "this home";

  return (
    <div className="mx-auto max-w-xl space-y-8 px-4 py-12 md:px-6">
      <header className="space-y-2">
        <p className="font-body text-label uppercase tracking-label text-gold-ink">Open house</p>
        <h1 className="font-display text-display-md text-navy">Welcome to {place}</h1>
        {event.start_time && <p className="font-body text-body text-ink">{openHouseLong(event.start_time, event.end_time)}</p>}
      </header>

      {event.accepting ? (
        <section aria-labelledby="signin-heading" className="space-y-4 border border-line bg-white p-6">
          <h2 id="signin-heading" className="font-display text-display-sm text-navy">
            Please sign in
          </h2>
          <LeadForm
            kind="open_house_signin"
            listingKey={event.listing_key}
            signinToken={token}
            submitLabel="Sign in"
            successMessage="Thanks for visiting. Enjoy the tour!"
            nextHref={`/open-house-sign-in/${token}`}
          >
            <fieldset className="font-body text-body-sm text-ink">
              <legend className="font-medium">Are you working with a real estate agent? (optional)</legend>
              <div className="mt-2 flex flex-wrap gap-6">
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="hasAgent" value="yes" className="h-5 w-5 accent-navy" />
                  Yes
                </label>
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="hasAgent" value="no" className="h-5 w-5 accent-navy" />
                  No
                </label>
              </div>
            </fieldset>
          </LeadForm>
        </section>
      ) : (
        <p role="status" className="border border-line bg-white p-6 font-body text-body text-ink">
          Sign-in for this open house is closed. It opens on the day of the event.
        </p>
      )}

      <MlsAttribution lastUpdated={lastUpdated} />
    </div>
  );
}

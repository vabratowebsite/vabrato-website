import { LeadForm } from "@/components/forms/LeadForm";

// "Connect with us" newsletter band (mockup 01), using the shared lead form so
// the privacy notice is shown where the email is collected (review item 4).
export function ConnectBand({ site = "vabrato" }: { site?: "vabrato" | "sancarloslife" }) {
  return (
    <section aria-labelledby="connect-heading" className="bg-soft">
      <div className="mx-auto grid max-w-site items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
        <h2 id="connect-heading" className="font-display text-display-md uppercase text-navy">
          Connect with us
        </h2>
        <div>
          <p className="mb-4 font-body text-body text-ink">Sign up to get the latest market trends and updates about Peninsula real estate.</p>
          <LeadForm kind="newsletter" site={site} submitLabel="Sign me up" askPhone={false} successMessage="Thanks for signing up. Watch your inbox for our next update." />
        </div>
      </div>
    </section>
  );
}

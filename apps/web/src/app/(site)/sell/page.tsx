import { SectionTitle } from "@vabrato/ui/web";
import { LeadForm } from "@/components/forms/LeadForm";
import { SelectField, TextArea, TextField } from "@/components/forms/fields";
import { pageMetadata } from "@/lib/seo";

// Home valuation request. A broker prepares it from recent sales; there is no
// automated valuation and nothing here is an appraisal.
export const metadata = pageMetadata({
  title: "What's my home worth? Free home valuation | Vabrato",
  description: "Request a free home valuation from a Vabrato broker in San Mateo and Santa Clara Counties.",
  path: "/sell",
});

export default function SellPage() {
  return (
    <div className="mx-auto grid max-w-site gap-12 px-4 py-12 md:grid-cols-[1fr_1.3fr] md:px-6">
      <div className="space-y-6">
        <SectionTitle as="h1" title="What's my home worth?" eyebrow="Selling with Vabrato" hairline={false} />
        <p className="font-body text-body-lg text-ink">
          A Vabrato broker reviews recent sales near you and sends a written valuation, usually within two business days. It&apos;s free and there&apos;s no obligation.
        </p>
        <p className="font-body text-body-sm text-muted">This is a broker&apos;s opinion of value for marketing purposes, not an appraisal.</p>
        <p className="font-body text-body-sm text-ink">PLACEHOLDER: seller services copy (content checklist).</p>
      </div>
      <section aria-labelledby="valuation-form">
        <h2 id="valuation-form" className="mb-4 font-subhead text-subhead-lg text-ink">
          Request a valuation
        </h2>
        <LeadForm kind="valuation" submitLabel="Request my valuation" successMessage="Thanks. A broker will send your valuation within two business days.">
          <TextField label="Property address (required)" name="address" autoComplete="street-address" required />
          <SelectField label="When are you thinking of selling?" name="timeline" defaultValue="exploring">
            <option value="exploring">Just exploring</option>
            <option value="0-3">In the next 3 months</option>
            <option value="3-6">In 3 to 6 months</option>
            <option value="6+">More than 6 months out</option>
          </SelectField>
          <TextArea label="Anything we should know? (updates, condition)" name="message" />
        </LeadForm>
      </section>
    </div>
  );
}

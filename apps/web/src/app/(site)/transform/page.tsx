import { BeforeAfterSlider, ListingPhotoPlaceholder, SectionTitle } from "@vabrato/ui/web";
import { LeadForm } from "@/components/forms/LeadForm";
import { SelectField, TextArea, TextField } from "@/components/forms/fields";
import { CSLB_LICENSE } from "@/lib/org";
import { pageMetadata } from "@/lib/seo";

// "We can transform your home": Vabrato's general contractor service.
// The CSLB license number is a placeholder until confirmed (review item 3).
export const metadata = pageMetadata({
  title: "Transform your home before you sell | Vabrato",
  description: "Pre-sale renovation managed by Vabrato's licensed general contractor team.",
  path: "/transform",
});

const projects = [
  ["Kitchen refresh", "mauve", "steel"],
  ["Bath and floors", "slate", "mauve"],
] as const;

export default function TransformPage() {
  return (
    <div className="mx-auto max-w-site space-y-14 px-4 py-12 md:px-6">
      <header className="space-y-4">
        <SectionTitle as="h1" title="We can transform your home" eyebrow="General contractor services" hairline={false} />
        <p className="max-w-prose font-body text-body-lg text-ink">PLACEHOLDER: GC service copy (content checklist). We scope, manage and finish pre-sale work so your home lists at its best.</p>
        <p className="font-body text-body-sm text-ink">
          Licensed general contractor: CSLB License #{CSLB_LICENSE.number}
          {CSLB_LICENSE.placeholder ? " (pending confirmation)" : ""}
        </p>
      </header>

      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="mb-6 font-subhead text-subhead-lg text-ink">
          Recent projects
        </h2>
        <ul className="grid gap-8 md:grid-cols-2">
          {projects.map(([title, before, after]) => (
            <li key={title}>
              <BeforeAfterSlider label={`${title}: before and after`} before={<ListingPhotoPlaceholder tint={before} label="Before photo (placeholder)" />} after={<ListingPhotoPlaceholder tint={after} label="After photo (placeholder)" />} />
              <p className="mt-3 font-subhead text-subhead-md text-ink">{title} (placeholder)</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="estimate-heading" className="grid gap-10 md:grid-cols-[1fr_1.3fr]">
        <div>
          <h2 id="estimate-heading" className="font-display text-display-sm uppercase text-navy">
            Estimate my pre-sale project
          </h2>
          <p className="mt-3 font-body text-body text-ink">Tell us about the home and what you&apos;d like to change. A project manager will follow up to schedule a walkthrough.</p>
        </div>
        <LeadForm kind="transform" submitLabel="Request an estimate" successMessage="Thanks. A project manager will contact you to schedule a walkthrough.">
          <TextField label="Property address" name="address" autoComplete="street-address" />
          <SelectField label="Project type" name="projectType" defaultValue="refresh">
            <option value="refresh">Paint, floors and refresh</option>
            <option value="kitchen">Kitchen</option>
            <option value="bath">Bathrooms</option>
            <option value="exterior">Exterior and landscaping</option>
            <option value="other">Something else</option>
          </SelectField>
          <SelectField label="Budget" name="budget" defaultValue="unsure">
            <option value="unsure">Not sure yet</option>
            <option value="under-25k">Under $25K</option>
            <option value="25-75k">$25K to $75K</option>
            <option value="75k+">Over $75K</option>
          </SelectField>
          <TextArea label="Project details" name="message" />
        </LeadForm>
      </section>
    </div>
  );
}

import { LeadForm } from "@/components/forms/LeadForm";

// "Schedule a private tour" card (mockup 03). Day chips are the next four
// days in Pacific time. The request is a `tour` lead; S6 routes it to Mark
// (SPEC <lead_routing>).

const PT = "America/Los_Angeles";

export function nextTourDays(now: Date = new Date(), count = 4) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getTime() + (i + 1) * 86_400_000);
    return {
      value: d.toLocaleDateString("en-CA", { timeZone: PT }),
      weekday: d.toLocaleDateString("en-US", { timeZone: PT, weekday: "short" }),
      day: d.toLocaleDateString("en-US", { timeZone: PT, day: "numeric" }),
      label: d.toLocaleDateString("en-US", { timeZone: PT, weekday: "long", month: "long", day: "numeric" }),
    };
  });
}

const chip =
  "flex min-h-[48px] cursor-pointer flex-col items-center justify-center border border-white/60 px-2 py-1 text-center font-body text-[11px] uppercase tracking-label text-white peer-checked:border-white peer-checked:bg-white peer-checked:text-navy peer-focus-visible:ring-2 peer-focus-visible:ring-gold";

export function TourRequest({ listingKey, agentName, agentTitle, site }: { listingKey: string; agentName: string; agentTitle: string; site?: "vabrato" | "sancarloslife" }) {
  const days = nextTourDays();
  const initials = agentName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <section aria-labelledby="tour-heading" className="bg-navy p-6 text-white">
      <div className="mb-5 flex items-center gap-4">
        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-deep font-subhead text-subhead-md">
          {initials}
        </span>
        <div>
          <p className="font-subhead text-subhead-md">{agentName}</p>
          <p className="font-body text-caption text-white/85">{agentTitle}</p>
        </div>
      </div>
      <h2 id="tour-heading" className="mb-3 font-body text-label font-medium uppercase tracking-label">
        Schedule a private tour
      </h2>
      <LeadForm kind="tour" listingKey={listingKey} site={site} submitLabel="Request tour" tone="dark" successMessage="Thanks. An agent will confirm your tour time within one business day.">
        <fieldset>
          <legend className="sr-only">Preferred day</legend>
          <div className="grid grid-cols-4 gap-2">
            {days.map((d, i) => (
              <label key={d.value} className="relative">
                <input type="radio" name="tourDate" value={d.value} defaultChecked={i === 1} className="peer sr-only" />
                <span className={chip}>
                  <span aria-hidden="true">{d.weekday}</span>
                  <span aria-hidden="true" className="font-bold">
                    {d.day}
                  </span>
                  <span className="sr-only">{d.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="sr-only">Tour type</legend>
          <div className="flex gap-2">
            {[
              ["in-person", "In person"],
              ["video", "Video call"],
            ].map(([value, label], i) => (
              <label key={value} className="relative">
                <input type="radio" name="tourMode" value={value} defaultChecked={i === 0} className="peer sr-only" />
                <span className={`${chip} min-h-[44px] px-3 normal-case tracking-normal`}>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </LeadForm>
    </section>
  );
}

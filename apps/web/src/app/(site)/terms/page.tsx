import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "../legal-page";

export const metadata = pageMetadata({
  title: "Terms of use | Vabrato Real Estate Services",
  description: "Terms of use for vabrato.com.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="PLACEHOLDER">
      <section>
        <h2>Listing information</h2>
        <p>PLACEHOLDER: listing data is provided by MLSListings Inc. for consumers&apos; personal, non-commercial use and is deemed reliable but not guaranteed.</p>
      </section>
      <section>
        <h2>Estimates are not offers</h2>
        <p>PLACEHOLDER: payment estimates and other figures are illustrations only, not loan offers or appraisals.</p>
      </section>
    </LegalPage>
  );
}

import { LegalPage } from "@/app/(site)/legal-page";
import { VOW_TERMS_VERSION } from "@/member/join";

// VOW Terms of Use (MLS-6). PLACEHOLDER copy (content checklist); the version
// below is stored with each acceptance. Members can only accept while the
// vow_enabled flag is on.
export const metadata = { title: "Terms of Use for listing data | Vabrato", robots: { index: false, follow: false } };

export default function VowTermsPage() {
  return (
    <LegalPage title="Terms of Use for listing data" updated={`PLACEHOLDER (version ${VOW_TERMS_VERSION})`}>
      <section>
        <h2>Who these terms are for</h2>
        <p>PLACEHOLDER: registered Vabrato clients who want to see sold prices and price history in their portal.</p>
      </section>
      <section>
        <h2>Personal, non-commercial use</h2>
        <p>PLACEHOLDER: listing data is for your personal, non-commercial use in buying or selling a home, and may not be copied or redistributed.</p>
      </section>
      <section>
        <h2>Who owns the data</h2>
        <p>PLACEHOLDER: MLSListings Inc. owns the MLS data. It is deemed reliable but not guaranteed.</p>
      </section>
      <section>
        <h2>Your brokerage relationship</h2>
        <p>PLACEHOLDER: you confirm you are interested in buying or selling and are working with Vabrato Real Estate Services as your brokerage.</p>
      </section>
    </LegalPage>
  );
}

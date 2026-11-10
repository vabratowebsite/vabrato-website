import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "../legal-page";

export const metadata = pageMetadata({
  title: "Accessibility | Vabrato Real Estate Services",
  description: "Vabrato's accessibility commitment and how to report a barrier.",
  path: "/accessibility",
});

export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility" updated="PLACEHOLDER">
      <section>
        <h2>Our commitment</h2>
        <p>PLACEHOLDER: we aim to meet WCAG 2.2 Level AA across vabrato.com, the member portal and the app.</p>
      </section>
      <section>
        <h2>Report a barrier</h2>
        <p>PLACEHOLDER: how to contact us, and our target response time.</p>
      </section>
    </LegalPage>
  );
}

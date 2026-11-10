import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "../legal-page";

export const metadata = pageMetadata({
  title: "Privacy notice | Vabrato Real Estate Services",
  description: "How Vabrato Real Estate Services collects and uses personal information.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="PLACEHOLDER">
      <section id="collection">
        <h2>Information we collect</h2>
        <p>PLACEHOLDER: what our forms collect (name, email, phone, message, property of interest) and why.</p>
      </section>
      <section id="use">
        <h2>How we use it</h2>
        <p>PLACEHOLDER: replying to your request, scheduling tours, and, only if you agree, calls or texts from our agents.</p>
      </section>
      <section id="retention">
        <h2>How long we keep it</h2>
        <p>PLACEHOLDER: inquiries are deleted 24 months after they are received unless they become part of a transaction file.</p>
      </section>
      <section id="rights">
        <h2>Your choices and California rights</h2>
        <p>PLACEHOLDER: access, deletion and opt-out requests, and how to contact us.</p>
      </section>
    </LegalPage>
  );
}

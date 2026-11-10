import { redirect } from "next/navigation";
import { flagEnabled } from "@/lib/public/listings";
import { OnboardingForm } from "@/member/components/AccountForms";
import { isMemberRole } from "@/member/roles";
import { requireMember } from "@/member/session";

// Onboarding when the join choices didn't arrive with the sign-in (Google
// from /sign-in, a lost cookie): role, details and consents, all unticked by
// default (review item 13).
export default async function WelcomePage() {
  const { profile } = await requireMember("/my/welcome");
  if (!isMemberRole(profile.role) || profile.onboarded_at) redirect("/my");
  const vowEnabled = await flagEnabled("vow_enabled");
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-4 py-12 md:px-6">
      <p className="font-body text-label uppercase tracking-label text-gold-ink">Welcome to Vabrato</p>
      <h1 className="font-display text-display-md uppercase text-navy">Set up your portal</h1>
      <p className="font-body text-body text-ink">Tell us what you&apos;re working on and we&apos;ll show the right tools.</p>
      <OnboardingForm fullName={profile.full_name} phone={profile.phone} vowEnabled={vowEnabled} />
      <p className="font-body text-caption text-muted">
        See our{" "}
        <a href="/privacy" className="text-navy underline">
          Privacy notice
        </a>{" "}
        for how we use your details.
      </p>
    </main>
  );
}

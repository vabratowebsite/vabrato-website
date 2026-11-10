import { redirect } from "next/navigation";
import { Button } from "@vabrato/ui/web";
import { CONSOLE_URL, homeFor, isMemberRole } from "@/member/roles";
import { requireMember } from "@/member/session";

// /my: send members to their portal home; staff to the console.
export default async function MyIndex() {
  const { profile } = await requireMember("/my");
  if (isMemberRole(profile.role)) {
    if (!profile.onboarded_at) redirect("/my/welcome");
    redirect(homeFor(profile.role));
  }
  return (
    <main id="main" className="mx-auto max-w-xl space-y-6 px-4 py-20 text-center md:px-6">
      <h1 className="font-display text-display-md uppercase text-navy">This portal is for clients</h1>
      <p className="font-body text-body-lg text-ink">You&apos;re signed in with a staff account. Use the agent console instead.</p>
      <div className="flex justify-center">
        <Button href={CONSOLE_URL} variant="navy" underline={false}>
          Open the agent console
        </Button>
      </div>
    </main>
  );
}

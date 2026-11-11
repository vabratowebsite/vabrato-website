import type { Profile } from "@vabrato/db";
import { Logo, Panel } from "@vabrato/ui/web";
import { signOutAction } from "@/lib/actions";
import { btnPrimary, mutedCls } from "./ui";

export function AccessDenied({ profile }: { profile: Profile }) {
  return (
    <main className="mx-auto max-w-lg space-y-8 px-4 py-16">
      <h1 className="sr-only">No access to the agent console</h1>
      <div className="flex justify-center">
        <Logo />
      </div>
      <Panel title="No access" headingLevel="h2">
        <p className={mutedCls}>
          Signed in as {profile.email} ({profile.role}), but the agent console is for the Vabrato team only. Clients use their portal on vabrato.com.
        </p>
        <form action={signOutAction} className="mt-5">
          <button type="submit" className={btnPrimary}>
            Sign out
          </button>
        </form>
      </Panel>
    </main>
  );
}

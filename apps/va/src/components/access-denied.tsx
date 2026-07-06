import type { Profile } from "@vabrato/db";
import { Panel, T } from "@vabrato/ui";
import { signOutAction } from "@/lib/actions";

export function AccessDenied({ profile }: { profile: Profile }) {
  return (
    <main className="mx-auto max-w-lg p-10">
      <Panel title="No access">
        <p className="text-sm" style={{ color: T.muted }}>
          Signed in as {profile.email} ({profile.role}), but the Transaction Desk is for the
          Vabrato team only.
        </p>
        <form action={signOutAction} className="mt-5">
          <button
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: T.ink, color: T.gold }}
          >
            Sign out
          </button>
        </form>
      </Panel>
    </main>
  );
}

import { redirect } from "next/navigation";
import type { UserRole } from "@vabrato/db";
import { STAFF_ROLES, getProfile, signOut } from "@vabrato/lib";
import { Panel, T } from "@vabrato/ui";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Buyers plus staff (staff preview client-facing screens).
const ALLOWED: UserRole[] = ["buyer", ...STAFF_ROLES];

async function handleSignOut() {
  "use server";
  const supabase = await supabaseServer();
  await signOut(supabase);
  redirect("/login");
}

function SignOutButton() {
  return (
    <form action={handleSignOut} className="mt-5">
      <button
        className="rounded-lg px-4 py-2 text-sm font-medium"
        style={{ background: T.ink, color: T.gold }}
      >
        Sign out
      </button>
    </form>
  );
}

export default async function Home() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile) redirect("/login");

  if (!ALLOWED.includes(profile.role)) {
    return (
      <main className="mx-auto max-w-lg p-10">
        <Panel title="No access">
          <p className="text-sm" style={{ color: T.muted }}>
            Signed in as {profile.email} ({profile.role}). The Property Tracker is for Vabrato
            buyers.
          </p>
          <SignOutButton />
        </Panel>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-10">
      <div className="mb-6">
        <div className="font-serif text-2xl tracking-wide" style={{ color: T.goldDeep }}>
          VABRATO
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-widest" style={{ color: T.faint }}>
          Property Tracker
        </div>
      </div>
      <Panel title="Signed in">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: T.muted }}>Email</dt>
            <dd>{profile.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: T.muted }}>Role</dt>
            <dd>{profile.role}</dd>
          </div>
        </dl>
        <SignOutButton />
      </Panel>
    </main>
  );
}

import { Panel, Pill } from "@vabrato/ui/web";
import { fmtLong } from "@vabrato/lib";
import { flagEnabled } from "@/lib/public/listings";
import { AlertsForm, DeletionForm, ProfileForm, RoleForm, VowForm } from "@/member/components/AccountForms";
import { SubmitButton } from "@/member/components/controls";
import { MemberShell } from "@/member/components/MemberShell";
import { requirePortalMember } from "@/member/session";
import { signOutAction } from "../actions";

// Account: details, alert emails, portal role, VOW terms (only while
// vow_enabled is on), sign out and account deletion (review item 14).
export default async function AccountPage() {
  const member = await requirePortalMember("/my/account");
  const { profile, supabase } = member;
  const [vowEnabled, deletion] = await Promise.all([
    flagEnabled("vow_enabled"),
    supabase.from("account_deletion_requests").select("status, requested_at").eq("status", "pending").maybeSingle(),
  ]);

  return (
    <MemberShell member={member} role={member.role} current="account" eyebrow="Account" title="Account and alerts">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Your details">
          <ProfileForm fullName={profile.full_name} phone={profile.phone} email={profile.email} />
        </Panel>
        <Panel title="Alert emails">
          <AlertsForm on={profile.alerts_email_opt_in} />
        </Panel>
        <Panel title="What you're working on">
          <RoleForm role={member.role} />
        </Panel>
        {vowEnabled && (
          <Panel title="Sold prices and price history">
            {profile.vow_accepted_at ? (
              <p className="font-body text-body text-ink">
                <Pill tone="green">Accepted</Pill> You accepted the Terms of Use (version {profile.vow_terms_version}) on {fmtLong(profile.vow_accepted_at.slice(0, 10))}.
              </p>
            ) : (
              <VowForm />
            )}
          </Panel>
        )}
        <Panel title="Sign out">
          <form action={signOutAction}>
            <SubmitButton variant="outline">Sign out</SubmitButton>
          </form>
        </Panel>
        <Panel title="Delete my account">
          <div className="space-y-4 font-body text-body-sm text-ink">
            <p>
              We delete your account within 45 days of your request: your profile, saved homes and searches, alerts, messages and documents you uploaded.
            </p>
            <p>
              We keep what the law or a transaction requires: transaction files for a sale or purchase we handled with you (California brokers keep these for at least three years), and records of emails we sent you.
            </p>
            {deletion.data ? (
              <p role="status">
                <Pill tone="gold">Requested</Pill> We received your request on {fmtLong(deletion.data.requested_at.slice(0, 10))}.
              </p>
            ) : (
              <DeletionForm />
            )}
          </div>
        </Panel>
      </div>
    </MemberShell>
  );
}

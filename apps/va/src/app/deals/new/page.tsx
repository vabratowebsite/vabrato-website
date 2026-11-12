import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { MASTER_FLAG } from "@/lib/assistant";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";
// Reading a long contract can take a few minutes (the contract reader's
// server action runs under this page's limit).
export const maxDuration = 300;

export default async function NewDealPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  // The contract reader shows only while the assistant and the feature are
  // both on; the database checks again on every request (ai_begin).
  const supabase = await supabaseServer();
  const { data: flags } = await supabase.from("feature_flags").select("key, enabled").in("key", [MASTER_FLAG, "ai_staff_contract_reader"]);
  const readerOn = (flags ?? []).filter((f) => f.enabled).length === 2;

  return (
    <ConsoleShell profile={profile} current="deals" eyebrow="Transactions" title="New transaction">
      <Panel title="Contract details">
        <IntakeForm reader={readerOn ? { profileId: profile.id } : null} />
      </Panel>
    </ConsoleShell>
  );
}

import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { aiAccess } from "@/lib/ai-flags";
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
  // The contract reader shows only when the database would let this person
  // run it (live switches, or AI test mode for a tester); it checks again on
  // every request (ai_begin).
  const supabase = await supabaseServer();
  const ai = await aiAccess(supabase, ["ai_staff_contract_reader"]);
  const readerOn = ai.on.ai_staff_contract_reader;

  return (
    <ConsoleShell profile={profile} current="deals" eyebrow="Transactions" title="New transaction">
      <Panel title="Contract details">
        <IntakeForm reader={readerOn ? { profileId: profile.id, testMode: ai.mode === "test" } : null} />
      </Panel>
    </ConsoleShell>
  );
}

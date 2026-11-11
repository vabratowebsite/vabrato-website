import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { requireSignIn } from "@/lib/staff";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function NewDealPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  return (
    <ConsoleShell profile={profile} current="deals" eyebrow="Transactions" title="New transaction">
      <Panel title="Contract details">
        <IntakeForm />
      </Panel>
    </ConsoleShell>
  );
}

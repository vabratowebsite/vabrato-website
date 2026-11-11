import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { VendorsView } from "./vendors-view";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const supabase = await supabaseServer();
  const { data: vendors } = await supabase.from("vendors").select("*").order("preferred", { ascending: false }).order("name");

  return (
    <ConsoleShell profile={profile} current="vendors" eyebrow="Transactions" title="Vendors">
      <VendorsView vendors={vendors ?? []} />
    </ConsoleShell>
  );
}

import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { VendorsView } from "./vendors-view";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const supabase = await supabaseServer();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("preferred", { ascending: false })
    .order("name");

  return (
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-5 font-serif text-xl">Vendors</h1>
        <VendorsView vendors={vendors ?? []} />
      </main>
    </div>
  );
}

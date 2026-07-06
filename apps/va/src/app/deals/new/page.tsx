import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { requireSignIn } from "@/lib/staff";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function NewDealPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  return (
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-2xl p-6">
        <IntakeForm />
      </main>
    </div>
  );
}

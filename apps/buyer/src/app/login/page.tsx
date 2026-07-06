import { redirect } from "next/navigation";
import { getAuthUser } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await supabaseServer();
  if (await getAuthUser(supabase)) redirect("/");
  return <LoginForm />;
}

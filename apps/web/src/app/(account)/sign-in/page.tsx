import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/member/components/AuthForms";
import { safeNext } from "@/member/join";
import { CONSOLE_URL } from "@/member/roles";
import { getMember } from "@/member/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in | Vabrato", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one below.",
  denied: "Sign-in was cancelled. Try again, or use the email link instead.",
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = sp.next ? safeNext(sp.next) : undefined;
  if (await getMember()) redirect(next ?? "/my");
  const error = sp.error ? ERRORS[sp.error] : undefined;

  return (
    <div className="mx-auto max-w-xl px-4 py-16 md:px-6">
      <h1 className="font-display text-display-md uppercase text-navy">Sign in</h1>
      <p className="mt-3 font-body text-body text-ink">We&apos;ll email you a link. No password needed.</p>
      {error && (
        <p role="alert" className="mt-6 border border-red bg-white p-4 font-body text-body-sm font-medium text-red">
          {error}
        </p>
      )}
      <div className="mt-8">
        <SignInForm next={next} />
      </div>
      <p className="mt-8 font-body text-body-sm text-muted">
        New here?{" "}
        <Link href={next ? `/join?next=${encodeURIComponent(next)}` : "/join"} className="text-navy underline">
          Create a free account
        </Link>{" "}
        · Agent or staff?{" "}
        <a href={CONSOLE_URL} className="text-navy underline">
          Staff sign-in
        </a>
        {" · "}
        <a href="/privacy" className="text-navy underline">
          Privacy notice
        </a>
      </p>
    </div>
  );
}

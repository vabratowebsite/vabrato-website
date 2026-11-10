import Link from "next/link";
import { redirect } from "next/navigation";
import { flagEnabled } from "@/lib/public/listings";
import { JoinForm } from "@/member/components/AuthForms";
import { safeNext } from "@/member/join";
import { CONSOLE_URL, MEMBER_ROLES, ROLE_CHOICES, type MemberRole } from "@/member/roles";
import { getMember } from "@/member/session";

// Join (mockup 04): step 1 picks buying / selling / both, step 2 collects the
// details and consents and sends a magic link (or Google).
export const dynamic = "force-dynamic";
export const metadata = { title: "Join the Vabrato client portal | Vabrato", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ role?: string; next?: string }> };

export default async function JoinPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = sp.next ? safeNext(sp.next) : undefined;
  if (await getMember()) redirect(next ?? "/my");
  const role = MEMBER_ROLES.includes(sp.role as MemberRole) ? (sp.role as MemberRole) : null;
  const vowEnabled = await flagEnabled("vow_enabled");
  const stepHref = (r?: MemberRole) => {
    const q = new URLSearchParams();
    if (r) q.set("role", r);
    if (next) q.set("next", next);
    const s = q.toString();
    return s ? `/join?${s}` : "/join";
  };

  return (
    <div className="mx-auto grid max-w-site gap-0 px-4 py-12 md:grid-cols-[2fr_3fr] md:px-6">
      <section aria-labelledby="join-pitch" className="bg-navy px-6 py-10 text-white md:px-10">
        <h1 id="join-pitch" className="font-display text-display-md uppercase">
          Join the Vabrato client portal
        </h1>
        <p className="mt-4 font-body text-body-lg text-white/90">One free account on the web and in the app. No passwords: we email you a sign-in link.</p>
        <ul className="mt-6 space-y-2 font-body text-body text-white/90">
          <li>Save homes and searches</li>
          <li>Alerts for new listings and price drops</li>
          <li>Tour requests and messages with your agent</li>
          <li>Your sale timeline, when you sell with us</li>
          {vowEnabled && <li>Sold prices and price history</li>}
        </ul>
      </section>

      <section aria-labelledby="join-step" className="border border-line bg-white px-6 py-10 md:px-10">
        <p className="font-body text-label uppercase tracking-label text-gold-ink">Step {role ? 2 : 1} of 2</p>
        {!role ? (
          <>
            <h2 id="join-step" className="mt-2 font-subhead text-subhead-lg text-ink">
              What brings you here?
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {ROLE_CHOICES.map((c) => (
                <li key={c.value}>
                  <Link
                    href={stepHref(c.value)}
                    className="flex h-full min-h-[44px] flex-col border border-muted p-4 font-body hover:border-navy hover:ring-1 hover:ring-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  >
                    <span className="text-body font-medium text-ink">{c.label}</span>
                    <span className="mt-1 text-body-sm text-muted">{c.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 id="join-step" className="mt-2 font-subhead text-subhead-lg text-ink">
              Your details
            </h2>
            <p className="mt-1 font-body text-body-sm text-muted">
              {ROLE_CHOICES.find((c) => c.value === role)!.label}.{" "}
              <Link href={stepHref()} className="text-navy underline">
                Change
              </Link>
            </p>
            <div className="mt-6">
              <JoinForm role={role} next={next} vowEnabled={vowEnabled} />
            </div>
          </>
        )}
        <p className="mt-8 font-body text-body-sm text-muted">
          Already a member?{" "}
          <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"} className="text-navy underline">
            Sign in
          </Link>{" "}
          · Agent or staff?{" "}
          <a href={CONSOLE_URL} className="text-navy underline">
            Staff sign-in
          </a>
        </p>
      </section>
    </div>
  );
}

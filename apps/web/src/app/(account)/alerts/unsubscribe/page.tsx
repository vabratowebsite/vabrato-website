import { UnsubscribeForm } from "@/member/components/UnsubscribeForm";
import { UNSUBSCRIBE_TOKEN } from "@/member/unsubscribe";

// Confirm page for the unsubscribe link in alert emails. Opening it changes
// nothing; the button does (review item 15: a GET never unsubscribes).
export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe from alert emails | Vabrato", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ t?: string }> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const { t } = await searchParams;
  const valid = typeof t === "string" && UNSUBSCRIBE_TOKEN.test(t);
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-16 md:px-6">
      <h1 className="font-display text-display-md uppercase text-navy">Alert emails</h1>
      {valid ? (
        <>
          <p className="font-body text-body text-ink">Stop emails about new listings and price changes for your saved homes and searches?</p>
          <UnsubscribeForm token={t} />
        </>
      ) : (
        <p className="font-body text-body text-ink">
          This unsubscribe link isn&apos;t complete. Use the link in the email again, or{" "}
          <a href="/sign-in?next=/my/account" className="text-navy underline">
            sign in
          </a>{" "}
          and turn alert emails off in your account.
        </p>
      )}
    </div>
  );
}

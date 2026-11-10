import Link from "next/link";
import type { Profile } from "@vabrato/db";
import { T } from "@vabrato/ui";
import { signOutAction } from "@/lib/actions";

export function Header({ profile }: { profile: Profile }) {
  return (
    <header
      className="flex items-center justify-between px-6 py-3"
      style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }}
    >
      <Link href="/" className="leading-tight">
        <span className="font-serif text-lg tracking-wide" style={{ color: T.goldDeep }}>
          VABRATO
        </span>
        <span className="ml-2 text-[10px] uppercase tracking-widest" style={{ color: T.faint }}>
          Transaction Desk
        </span>
      </Link>
      <div className="flex items-center gap-4">
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" style={{ color: T.muted }}>
            Transactions
          </Link>
          <Link href="/vendors" style={{ color: T.muted }}>
            Vendors
          </Link>
          <Link href="/messages" style={{ color: T.muted }}>
            Messages
          </Link>
          <Link href="/open-houses" style={{ color: T.muted }}>
            Open houses
          </Link>
        </nav>
        <span className="text-xs" style={{ color: T.muted }}>
          {profile.email} · {profile.role}
        </span>
        <form action={signOutAction}>
          <button
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: `1px solid ${T.line}`, color: T.muted }}
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

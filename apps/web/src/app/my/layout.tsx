import type { ReactNode } from "react";

// Member portal. Personal data: never indexed, never cached (each page reads
// the member's session; middleware refreshes it on /my paths).
export const dynamic = "force-dynamic";
export const metadata = { title: "My portal | Vabrato", robots: { index: false, follow: false } };

export default function MyLayout({ children }: { children: ReactNode }) {
  return children;
}

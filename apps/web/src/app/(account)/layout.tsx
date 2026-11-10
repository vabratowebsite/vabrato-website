import type { ReactNode } from "react";
import { SiteChrome } from "@/components/SiteChrome";

// Join, sign-in and the VOW Terms page: vabrato.com chrome, never indexed.
// Kept outside (site) because these forms collect account details, which the
// public-route guard only allows in lead forms; their own guard test covers
// the privacy notice link.
export const metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@vabrato/ui/tokens.css";
import "./globals.css";
import { fontVariables } from "./fonts";

export const metadata: Metadata = {
  title: "Vabrato Agent Console",
  description: "Vabrato staff console: leads, members, transactions and the MLS feed",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-screen bg-soft font-body text-ink antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@vabrato/ui/tokens.css";
import "./globals.css";
import { fontVariables } from "./fonts";

// Holding shell until S4. Not indexed: the live site is still WordPress.
export const metadata: Metadata = {
  title: "Vabrato Real Estate Services",
  description: "Vabrato Real Estate Services, San Carlos, CA",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-screen bg-white font-body text-ink antialiased">{children}</body>
    </html>
  );
}

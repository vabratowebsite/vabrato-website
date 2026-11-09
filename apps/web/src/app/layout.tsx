import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Holding shell until S4. Not indexed: the live site is still WordPress.
export const metadata: Metadata = {
  title: "Vabrato Real Estate Services",
  description: "Vabrato Real Estate Services, San Carlos, CA",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}

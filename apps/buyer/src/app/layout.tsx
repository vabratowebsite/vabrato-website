import type { Metadata } from "next";
import type { ReactNode } from "react";
import { T } from "@vabrato/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vabrato — Property Tracker",
  description: "Track the properties you're pursuing",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={{ background: T.canvas, color: T.text }}>
        {children}
      </body>
    </html>
  );
}

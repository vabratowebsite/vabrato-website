"use client";

import { btnSecondary } from "./ui";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={btnSecondary} data-no-print>
      {label}
    </button>
  );
}

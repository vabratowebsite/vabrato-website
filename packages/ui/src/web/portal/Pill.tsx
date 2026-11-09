import type { ReactNode } from "react";
import { cx } from "../cx";

export type PillTone = "neutral" | "navy" | "green" | "red" | "gold" | "outline";

const tones: Record<PillTone, string> = {
  neutral: "bg-navy-50 text-navy",
  navy: "bg-navy text-white",
  green: "bg-green-50 text-green",
  red: "bg-red-50 text-red",
  gold: "bg-gold-50 text-gold-ink",
  outline: "border border-muted text-ink",
};

/** Rounded status pill, e.g. "In escrow", "Price ↓ $100K", "Open Sun 1–4". */
export function Pill({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 font-body text-caption font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

import type { ReactNode } from "react";
import { cx } from "../cx";
import { Button } from "./Button";

export interface SectionTitleProps {
  title: string;
  eyebrow?: string;
  /** Optional outlined action on the right, e.g. "View all for sale". */
  action?: { label: string; href: string };
  as?: "h1" | "h2" | "h3";
  tone?: "light" | "dark";
  /** Draw the hairline between the title and the action. */
  hairline?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Uppercase Bodoni title + hairline + outlined button (mockups 01, 09). */
export function SectionTitle({
  title,
  eyebrow,
  action,
  as: H = "h2",
  tone = "light",
  hairline = true,
  children,
  className,
}: SectionTitleProps) {
  return (
    <div className={cx("mb-8", className)}>
      {eyebrow && (
        <p
          className={cx(
            "mb-2 font-body text-label font-medium uppercase tracking-wide",
            tone === "light" ? "text-gold-ink" : "text-gold",
          )}
        >
          {eyebrow}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-6">
        <H
          className={cx(
            "font-display text-display-sm uppercase tracking-display md:text-display-md",
            tone === "light" ? "text-navy" : "text-white",
          )}
        >
          {title}
        </H>
        {hairline && (
          <span
            aria-hidden="true"
            className={cx(
              "hidden h-px flex-1 md:block",
              tone === "light" ? "bg-line" : "bg-white/30",
            )}
          />
        )}
        {action && (
          <Button
            href={action.href}
            size="sm"
            variant={tone === "light" ? "outline" : "ghost-dark"}
          >
            {action.label}
          </Button>
        )}
      </div>
      {children && (
        <div
          className={cx(
            "mt-3 max-w-2xl font-body text-body-sm",
            tone === "light" ? "text-muted" : "text-white/80",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Small uppercase gold label used above headings. */
export function Eyebrow({
  children,
  tone = "light",
  className,
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p
      className={cx(
        "font-body text-label font-medium uppercase tracking-wide",
        tone === "light" ? "text-gold-ink" : "text-gold",
        className,
      )}
    >
      {children}
    </p>
  );
}

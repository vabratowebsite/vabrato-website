import type { ReactNode } from "react";
import { cx, focusLight } from "../cx";

/** White portal panel with a Libre Baskerville title and optional action (mockups 05, 06). */
export function Panel({
  title,
  action,
  children,
  className,
  headingLevel: H = "h2",
}: {
  title: string;
  /** Right-aligned uppercase link/button, e.g. "Add to calendar". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <section className={cx("border border-line bg-white p-6", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <H className="font-subhead text-subhead-md text-ink">{title}</H>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small uppercase navy text action used in panel headers. */
export function PanelAction({
  href,
  children,
  onClick,
}: {
  href?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const cls = cx(
    "font-body text-label font-medium uppercase tracking-label text-navy hover:underline",
    focusLight,
  );
  return href ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

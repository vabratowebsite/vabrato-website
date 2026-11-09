import type { ReactNode } from "react";
import { cx } from "../cx";
import { Button } from "../site/Button";
import { Eyebrow } from "../site/SectionTitle";

export interface WelcomeBlockProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: { label: string; href: string };
  /** Image (Vabrato's own photography) or any media node. */
  media: ReactNode;
  /** Put the media on the left. */
  reverse?: boolean;
}

/** Text + image block (mockup 01 "Welcome", "Meet Vabrato"). */
export function WelcomeBlock({
  eyebrow,
  title,
  subtitle,
  children,
  action,
  media,
  reverse,
}: WelcomeBlockProps) {
  return (
    <section className="mx-auto grid max-w-site items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
      <div className={cx(reverse && "md:order-2")}>
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h2 className="font-display text-display-md uppercase text-navy">{title}</h2>
        {subtitle && <p className="mt-2 font-subhead text-subhead-sm text-ink">{subtitle}</p>}
        <div className="mt-4 space-y-3 font-body text-body-sm text-ink">{children}</div>
        {action && (
          <div className="mt-6">
            <Button href={action.href} size="sm">
              {action.label}
            </Button>
          </div>
        )}
      </div>
      <div className={cx("overflow-hidden", reverse && "md:order-1")}>{media}</div>
    </section>
  );
}

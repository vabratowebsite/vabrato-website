import type { ReactNode } from "react";
import { Button } from "../site/Button";
import { Eyebrow } from "../site/SectionTitle";

export interface PitchPoint {
  who: string;
  text: string;
}

/** Client Portal pitch: media + points + CTAs (mockup 01 "Your move, in one place"). */
export function PortalPitch({
  eyebrow = "Vabrato client portal · Free",
  title,
  points,
  media,
  primary,
  secondary,
}: {
  eyebrow?: string;
  title: string;
  points: PitchPoint[];
  media: ReactNode;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="grid items-stretch bg-soft md:grid-cols-2">
      <div className="min-h-[18rem]">{media}</div>
      <div className="px-6 py-12 md:px-12">
        <Eyebrow className="mb-2">{eyebrow}</Eyebrow>
        <h2 className="font-display text-display-md uppercase text-navy">{title}</h2>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p.who} className="flex gap-3 font-body text-body-sm text-ink">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-none bg-gold" />
              <span>
                <strong className="font-medium text-navy">{p.who}</strong> — {p.text}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-4">
          <Button href={primary.href} variant="navy" size="sm">
            {primary.label}
          </Button>
          {secondary && (
            <Button href={secondary.href} size="sm">
              {secondary.label}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

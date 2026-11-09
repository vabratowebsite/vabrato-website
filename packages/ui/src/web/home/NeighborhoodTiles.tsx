import type { ReactNode } from "react";
import { cx, focusDark } from "../cx";

export interface Neighborhood {
  name: string;
  href: string;
  /** "Median $2.4M · 18 active". Stats are gated by `public_stats` (MLS-10). */
  meta?: string;
  image: ReactNode;
}

/** Neighborhood/city tiles (mockup 01). */
export function NeighborhoodTiles({ items }: { items: Neighborhood[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((n) => (
        <li key={n.href}>
          <a
            href={n.href}
            className={cx(
              "group relative block aspect-[4/3] overflow-hidden bg-charcoal text-white",
              focusDark,
            )}
          >
            {n.image}
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent"
            />
            <span className="absolute bottom-3 left-3 right-3">
              <span className="block font-display text-subhead-lg uppercase">{n.name}</span>
              {n.meta && (
                <span className="block font-body text-[11px] uppercase tracking-label text-white/90">
                  {n.meta}
                </span>
              )}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

import { cx } from "../cx";

export interface LogoProps {
  /** Real logo file (SVG/PNG) once supplied; until then a text wordmark renders. */
  src?: string;
  /** "light" for white backgrounds, "dark" for navy/charcoal. */
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const scale = { sm: 0.75, md: 1, lg: 1.35 } as const;

/** Vabrato wordmark. Accessible name: "Vabrato Real Estate Services". */
export function Logo({ src, tone = "light", size = "md", className }: LogoProps) {
  const s = scale[size];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="Vabrato Real Estate Services" height={56 * s} className={className} />
    );
  }
  return (
    <span
      role="img"
      aria-label="Vabrato Real Estate Services"
      className={cx("inline-flex flex-col items-center leading-none", className)}
      style={{ fontSize: `${s}rem` }}
    >
      {/* Gold mark: stylised rays, a placeholder for the real logo artwork. */}
      <svg aria-hidden="true" width={48 * s} height={14 * s} viewBox="0 0 48 14">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path
            key={i}
            d={`M24 14 L${6 + i * 6} 1`}
            stroke="var(--color-gold)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span
        className={cx(
          "font-display text-[1.35em] font-semibold uppercase tracking-display",
          tone === "light" ? "text-navy" : "text-white",
        )}
      >
        Vabrato
      </span>
      <span
        className={cx(
          "mt-0.5 font-subhead text-[0.5em] uppercase tracking-wide",
          tone === "light" ? "text-ink" : "text-white/80",
        )}
      >
        Real Estate Services
      </span>
    </span>
  );
}

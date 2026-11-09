import type { ReactNode } from "react";
import { cx, focusDark } from "../cx";
import { PlayIcon } from "../icons";

/** Accept only YouTube URLs so this component never links somewhere unexpected. */
export function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"].includes(u.hostname);
  } catch {
    return false;
  }
}

export interface VideoThumbProps {
  /** Poster image or node (Vabrato's own video stills). */
  poster: ReactNode;
  youtubeUrl: string;
  /** Video title; becomes the link's accessible name. */
  title: string;
  size?: "md" | "lg";
  className?: string;
}

/** Poster with a play button that opens the YouTube video in a new tab. */
export function VideoThumb({ poster, youtubeUrl, title, size = "lg", className }: VideoThumbProps) {
  const href = isYouTubeUrl(youtubeUrl) ? youtubeUrl : undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "group relative block aspect-video overflow-hidden bg-charcoal",
        focusDark,
        className,
      )}
    >
      {poster}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/35"
      />
      <span
        aria-hidden="true"
        className={cx(
          "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-white",
          size === "lg" ? "h-16 w-16" : "h-11 w-11",
        )}
      >
        <PlayIcon size={size === "lg" ? 26 : 18} />
      </span>
      <span className="sr-only">Play video: {title} (opens YouTube in a new tab)</span>
    </a>
  );
}

export interface VideoFeatureProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  video: VideoThumbProps;
  action?: ReactNode;
}

/** Image + play button feature (mockup 01 "Meet Vabrato"). */
export function VideoFeature({
  eyebrow,
  title,
  subtitle,
  children,
  video,
  action,
}: VideoFeatureProps) {
  return (
    <section className="mx-auto grid max-w-site items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
      <VideoThumb {...video} />
      <div>
        {eyebrow && (
          <p className="mb-2 font-body text-label font-medium uppercase tracking-wide text-gold-ink">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-display-md uppercase text-navy">{title}</h2>
        {subtitle && <p className="mt-2 font-subhead text-subhead-sm text-ink">{subtitle}</p>}
        {children && (
          <div className="mt-4 space-y-3 font-body text-body-sm text-ink">{children}</div>
        )}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </section>
  );
}

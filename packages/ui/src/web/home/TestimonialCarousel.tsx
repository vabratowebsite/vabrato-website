"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cx, focusLight } from "../cx";
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon, StarIcon } from "../icons";

export interface Testimonial {
  quote: string;
  /** "Paul K. · Seller" */
  author: string;
  /** "Verified Google review" */
  source?: string;
  rating?: number;
}

export interface TestimonialCarouselProps {
  items: Testimonial[];
  /** ms between slides while rotating. */
  interval?: number;
  autoPlay?: boolean;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  media?: ReactNode;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Accessible testimonial carousel (WAI-ARIA carousel pattern). Auto-rotation
 * stops while the pointer is over it, while anything inside has focus, when
 * the user presses Pause, and when reduced motion is requested.
 */
export function TestimonialCarousel({
  items,
  interval = 7000,
  autoPlay = true,
  title = "What our clients are saying",
  eyebrow,
  action,
  media,
}: TestimonialCarouselProps) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const id = useId();

  useEffect(() => setReduced(prefersReducedMotion()), []);

  const rotating = autoPlay && !userPaused && !hovered && !focused && !reduced && items.length > 1;

  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [rotating, interval, items.length]);

  if (items.length === 0) return null;
  const go = (d: number) => setIndex((i) => (i + d + items.length) % items.length);
  const current = items[index]!;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={title}
      className="bg-soft"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div
        className={cx(
          "mx-auto grid max-w-site items-center gap-10 px-4 py-16 md:px-6",
          Boolean(media) && "md:grid-cols-2",
        )}
      >
        <div>
          {eyebrow && (
            <p className="mb-2 font-body text-label font-medium uppercase tracking-wide text-gold-ink">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display text-display-md uppercase text-navy">{title}</h2>
          <div
            id={`${id}-slides`}
            aria-live={rotating ? "off" : "polite"}
            className="mt-6 min-h-[10rem]"
          >
            <figure
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${items.length}`}
              data-testid="testimonial-slide"
            >
              {current.rating !== undefined && (
                <div
                  className="mb-3 flex text-gold"
                  role="img"
                  aria-label={`${current.rating} out of 5 stars`}
                >
                  {Array.from({ length: Math.round(current.rating) }).map((_, i) => (
                    <StarIcon key={i} size={16} />
                  ))}
                </div>
              )}
              <blockquote className="font-subhead text-subhead-sm italic text-ink">
                “{current.quote}”
              </blockquote>
              <figcaption className="mt-4 font-body text-label uppercase tracking-label text-muted">
                {current.author}
                {current.source && <span className="text-gold-ink"> · {current.source}</span>}
              </figcaption>
            </figure>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {action}
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Start automatic slide show" : "Stop automatic slide show"}
              className={cx(
                "flex h-10 w-10 items-center justify-center border border-muted text-navy",
                focusLight,
              )}
            >
              {userPaused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
            </button>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-controls={`${id}-slides`}
              aria-label="Previous testimonial"
              className={cx(
                "flex h-10 w-10 items-center justify-center border border-muted text-navy",
                focusLight,
              )}
            >
              <ChevronLeftIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-controls={`${id}-slides`}
              aria-label="Next testimonial"
              className={cx(
                "flex h-10 w-10 items-center justify-center border border-muted text-navy",
                focusLight,
              )}
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
        </div>
        {media && <div className="overflow-hidden">{media}</div>}
      </div>
    </section>
  );
}

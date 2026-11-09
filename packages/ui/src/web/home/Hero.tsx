"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx, focusDark, focusLight } from "../cx";
import { SearchIcon } from "../icons";

export interface HeroTab {
  id: string;
  label: string;
  panel: ReactNode;
}

export interface HeroProps {
  eyebrow?: string;
  /** Lines of the display headline, e.g. ["Real estate, built by", "people who build."] */
  title: string[];
  subtitle?: string;
  /** Vabrato's own banner image (not MLS). Navy gradient when omitted. */
  backgroundSrc?: string;
  tabs: HeroTab[];
}

/** Home hero with tabbed search (mockup 01). Tabs follow the WAI-ARIA tabs pattern. */
export function Hero({ eyebrow, title, subtitle, backgroundSrc, tabs }: HeroProps) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      refs.current[next]?.focus();
    }
  };

  return (
    <section className="relative isolate overflow-hidden bg-navy text-white">
      {backgroundSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundSrc}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-deep/90 via-navy/70 to-navy/40"
      />
      <div className="mx-auto max-w-site px-4 pb-12 pt-20 md:px-6 md:pt-28">
        {eyebrow && (
          <p className="mb-3 font-body text-label uppercase tracking-wide text-gold">{eyebrow}</p>
        )}
        <h1 className="max-w-3xl font-display text-display-md uppercase leading-none md:text-display-xl">
          {title.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-xl font-subhead text-subhead-sm text-white/90">{subtitle}</p>
        )}

        <div className="mt-10 max-w-4xl">
          <div role="tablist" aria-label="Search" className="flex flex-wrap" onKeyDown={onKey}>
            {tabs.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="tab"
                type="button"
                id={`${base}-tab-${t.id}`}
                aria-selected={i === active}
                aria-controls={`${base}-panel-${t.id}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className={cx(
                  "min-h-[40px] px-4 font-body text-label font-medium uppercase tracking-label",
                  i === active
                    ? "bg-white text-navy"
                    : "bg-navy-deep/70 text-white hover:bg-navy-deep",
                  i === active ? focusLight : focusDark,
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tabs.map((t, i) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`${base}-panel-${t.id}`}
              aria-labelledby={`${base}-tab-${t.id}`}
              hidden={i !== active}
              className="bg-white p-4 text-ink shadow-pop"
            >
              {t.panel}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export interface SearchField {
  name: string;
  label: string;
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
}

/** Simple GET search form for a Hero tab. */
export function HeroSearchForm({
  action,
  fields,
  submitLabel = "Search",
}: {
  action: string;
  fields: SearchField[];
  submitLabel?: string;
}) {
  const id = useId();
  return (
    <form action={action} method="get" className="flex flex-col gap-3 md:flex-row md:items-end">
      {fields.map((f) => (
        <div key={f.name} className="flex flex-1 flex-col">
          <label
            htmlFor={`${id}-${f.name}`}
            className="font-body text-label font-medium uppercase tracking-label text-muted"
          >
            {f.label}
          </label>
          {f.options ? (
            <select
              id={`${id}-${f.name}`}
              name={f.name}
              defaultValue={f.defaultValue}
              className={cx(
                "min-h-[40px] border-b border-muted bg-white font-body text-body-sm text-ink",
                focusLight,
              )}
            >
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              id={`${id}-${f.name}`}
              name={f.name}
              placeholder={f.placeholder}
              defaultValue={f.defaultValue}
              className={cx(
                "min-h-[40px] border-b border-muted bg-white font-body text-body-sm text-ink placeholder:text-muted",
                focusLight,
              )}
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        className={cx(
          "inline-flex min-h-[44px] items-center justify-center gap-2 bg-navy px-6 font-body text-label font-medium uppercase tracking-label text-white hover:bg-navy-deep",
          focusLight,
        )}
      >
        <SearchIcon size={14} />
        {submitLabel}
      </button>
    </form>
  );
}

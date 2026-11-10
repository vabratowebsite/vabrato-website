import type { ReactNode } from "react";
import { cx, focusLight } from "../cx";
import { Button } from "../site/Button";

export interface NewsPost {
  title: string;
  excerpt: string;
  href: string;
  image?: ReactNode;
}

/** Navy feature panel + three posts (mockup 01 "Latest news & events"). */
export function NewsList({
  title = "Latest news & events",
  subtitle,
  blurb,
  allHref,
  posts,
}: {
  title?: string;
  subtitle?: string;
  blurb?: string;
  allHref: string;
  posts: NewsPost[];
}) {
  return (
    <section className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col justify-center bg-navy px-6 py-12 text-white md:px-12">
        <h2 className="font-display text-display-md uppercase">{title}</h2>
        {subtitle && <p className="mt-2 font-subhead text-subhead-sm">{subtitle}</p>}
        {blurb && <p className="mt-3 max-w-sm font-body text-body-sm text-white/85">{blurb}</p>}
        <div className="mt-6">
          <Button href={allHref} variant="ghost-dark" size="sm">
            Read more<span className="sr-only">: {title}</span>
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-line bg-white">
        {posts.slice(0, 3).map((p) => (
          <li key={p.href} className="grid items-center gap-4 px-6 py-6 sm:grid-cols-[1fr_auto]">
            <div>
              <h3 className="font-subhead text-body text-ink">{p.title}</h3>
              <p className="mt-1 font-body text-caption text-muted">{p.excerpt}</p>
              <a
                href={p.href}
                className={cx(
                  "mt-3 inline-flex min-h-[28px] items-center border border-navy px-3 font-body text-[10px] font-medium uppercase tracking-label text-navy hover:bg-navy hover:text-white",
                  focusLight,
                )}
              >
                Read more<span className="sr-only">: {p.title}</span>
              </a>
            </div>
            {p.image && <div className="hidden h-24 w-32 overflow-hidden sm:block">{p.image}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

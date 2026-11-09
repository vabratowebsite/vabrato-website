import { cx, focusDark } from "../cx";

export interface Crumb {
  label: string;
  href?: string;
}

/** Navy breadcrumb strip under the header. The last crumb is the current page. */
export function BreadcrumbBar({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cx("bg-navy text-white", className)}>
      <ol className="mx-auto flex max-w-site flex-wrap items-center gap-1 px-4 py-2 font-body text-[11px] font-bold uppercase tracking-[0.04em] md:px-6">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.href && !last ? (
                <a href={c.href} className={cx("hover:underline", focusDark)}>
                  {c.label}
                </a>
              ) : (
                <span aria-current={last ? "page" : undefined}>{c.label}</span>
              )}
              {!last && <span aria-hidden="true">»</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

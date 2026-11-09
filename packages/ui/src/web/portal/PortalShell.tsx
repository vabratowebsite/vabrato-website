import type { ReactNode } from "react";
import { cx, focusDark } from "../cx";
import { Logo } from "../site/Logo";

export interface PortalNavItem {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Count badge, e.g. open to-dos. */
  count?: number;
  current?: boolean;
}

export interface PortalNavGroup {
  /** Optional group heading, e.g. "Explore", "Assistant". */
  label?: string;
  items: PortalNavItem[];
}

export interface PortalShellProps {
  nav: PortalNavGroup[];
  /** "Seller portal · 88 Hillcrest Dr, San Carlos (sample)" */
  eyebrow?: string;
  title: string;
  /** Right side of the top bar: status pill, notifications, avatar. */
  topRight?: ReactNode;
  /** "Your team" box at the bottom of the sidebar. */
  sidebarFooter?: ReactNode;
  logoSrc?: string;
  /** Render inside another page (styleguide): no <main>, title as <h2>. */
  embedded?: boolean;
  children: ReactNode;
}

/** Member portal frame: navy sidebar + top bar (mockups 05, 06, 11). */
export function PortalShell({
  nav,
  eyebrow,
  title,
  topRight,
  sidebarFooter,
  logoSrc,
  embedded,
  children,
}: PortalShellProps) {
  const Main = embedded ? "div" : "main";
  const H = embedded ? "h2" : "h1";
  const Side = embedded ? "div" : "aside";
  return (
    <div className={cx("flex flex-col bg-soft md:flex-row", !embedded && "min-h-screen")}>
      <Side className="flex flex-col bg-navy text-white md:w-64 md:flex-none">
        <div className="m-4 flex justify-center bg-white px-4 py-3">
          <Logo src={logoSrc} size="sm" />
        </div>
        <nav aria-label={embedded ? "Portal (preview)" : "Portal"} className="flex-1">
          {nav.map((g, gi) => (
            <div key={g.label ?? gi} className="mt-2">
              {g.label && (
                <p className="px-6 pb-1 pt-4 font-body text-[10px] uppercase tracking-wide text-white/75">
                  {g.label}
                </p>
              )}
              <ul>
                {g.items.map((it) => (
                  <li key={it.href}>
                    <a
                      href={it.href}
                      aria-current={it.current ? "page" : undefined}
                      className={cx(
                        "flex min-h-[44px] items-center gap-3 border-l-4 px-5 font-body text-body-sm",
                        it.current
                          ? "border-gold bg-white/10 text-white"
                          : "border-transparent text-white/90 hover:bg-white/5",
                        focusDark,
                      )}
                    >
                      {it.icon && (
                        <span aria-hidden="true" className="w-4">
                          {it.icon}
                        </span>
                      )}
                      <span className="flex-1">{it.label}</span>
                      {it.count !== undefined && it.count > 0 && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-gold px-1.5 text-[11px] font-medium text-ink">
                          {it.count}
                          <span className="sr-only"> new</span>
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {sidebarFooter && (
          <div className="m-4 bg-white/10 p-4 font-body text-body-sm text-white">
            {sidebarFooter}
          </div>
        )}
      </Side>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-6 py-5 md:px-9">
          <div>
            {eyebrow && (
              <p className="font-body text-label font-medium uppercase tracking-wide text-gold-ink">
                {eyebrow}
              </p>
            )}
            <H className="font-display text-display-sm uppercase text-navy">{title}</H>
          </div>
          {topRight && <div className="flex items-center gap-4">{topRight}</div>}
        </header>
        <Main className="flex-1 px-6 py-6 md:px-9">{children}</Main>
      </div>
    </div>
  );
}

/** Round initials avatar for the top bar. */
export function Avatar({ initials, label }: { initials: string; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-body text-caption font-bold text-white"
    >
      {initials}
    </span>
  );
}

"use client";

import { useId, useState } from "react";
import { cx, focusLight } from "../cx";
import { CloseIcon, MenuIcon, SearchIcon } from "../icons";
import { Logo } from "./Logo";

export interface NavItem {
  label: string;
  href: string;
}

export interface SiteHeaderProps {
  nav: NavItem[];
  /** Path of the current page; the matching nav item gets aria-current. */
  currentHref?: string;
  homeHref?: string;
  signInHref?: string;
  joinHref?: string;
  searchHref?: string;
  logoSrc?: string;
}

/** Centered logo, dot-separated nav, Sign in / Join, MENU + search (mockups 01, 03, 09). */
export function SiteHeader({
  nav,
  currentHref,
  homeHref = "/",
  signInHref = "/sign-in",
  joinHref = "/join",
  searchHref = "/search",
  logoSrc,
}: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto grid max-w-site grid-cols-[1fr_auto_1fr] items-center px-4 pt-3 md:px-6">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((o) => !o)}
            className={cx(
              "flex min-h-[44px] items-center gap-2 px-2 font-body text-label font-medium uppercase tracking-label text-navy",
              focusLight,
            )}
          >
            {open ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
            <span>Menu</span>
          </button>
          <a
            href={searchHref}
            className={cx("flex h-11 w-11 items-center justify-center text-navy", focusLight)}
          >
            <SearchIcon size={18} />
            <span className="sr-only">Search homes</span>
          </a>
        </div>
        <a href={homeHref} className={cx("justify-self-center", focusLight)}>
          <Logo src={logoSrc} size="sm" />
        </a>
        <div className="flex items-center justify-end gap-2">
          <a
            href={signInHref}
            className={cx(
              "hidden min-h-[32px] items-center px-2 font-body text-label font-medium uppercase tracking-label text-ink sm:flex",
              focusLight,
            )}
          >
            Sign in
          </a>
          <a
            href={joinHref}
            className={cx(
              "flex min-h-[32px] items-center bg-navy px-4 font-body text-label font-medium uppercase tracking-label text-white hover:bg-navy-deep",
              focusLight,
            )}
          >
            Join free
          </a>
        </div>
      </div>

      <nav aria-label="Main" className="hidden md:block">
        <ul className="mx-auto flex max-w-site flex-wrap items-center justify-center px-6 py-2">
          {nav.map((item, i) => (
            <li key={item.href} className="flex items-center">
              {i > 0 && (
                <span aria-hidden="true" className="mx-3 text-muted">
                  ·
                </span>
              )}
              <a
                href={item.href}
                aria-current={currentHref === item.href ? "page" : undefined}
                className={cx(
                  "py-1 font-body text-label uppercase tracking-label text-ink hover:text-navy aria-[current=page]:border-b aria-[current=page]:border-gold aria-[current=page]:text-navy",
                  focusLight,
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div id={menuId} hidden={!open} className="border-t border-line bg-white">
        <ul className="mx-auto max-w-site px-4 py-2 md:px-6">
          {nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={currentHref === item.href ? "page" : undefined}
                className={cx(
                  "block min-h-[44px] py-3 font-body text-body-sm uppercase tracking-label text-ink",
                  focusLight,
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
          <li className="sm:hidden">
            <a
              href={signInHref}
              className={cx(
                "block min-h-[44px] py-3 font-body text-body-sm uppercase tracking-label text-navy",
                focusLight,
              )}
            >
              Sign in
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
}

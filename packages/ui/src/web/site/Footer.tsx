import type { ReactNode } from "react";
import { cx, focusDark } from "../cx";
import { PhoneIcon } from "../icons";
import { EqualHousingIcon } from "./EqualHousingIcon";
import { Logo } from "./Logo";
import { SocialLinks, type SocialLink } from "./SocialRail";
import type { NavItem } from "./SiteHeader";

export interface FooterProps {
  phones: { label: string; number: string }[];
  address: string;
  /** e.g. "DRE# 02142060". */
  dre: string;
  nav: NavItem[];
  social?: SocialLink[];
  /** Newsletter form or ConnectNewsletter; optional. */
  newsletter?: ReactNode;
  /** MLS disclaimer + logo + last-updated time (MLS-1). Required on pages that show MLS data. */
  mlsDisclaimer?: ReactNode;
  logoSrc?: string;
  year?: number;
}

const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

/** Site footer: logo, phones, address, DRE, newsletter, nav, MLS disclaimer slot, Equal Housing. */
export function Footer({
  phones,
  address,
  dre,
  nav,
  social,
  newsletter,
  mlsDisclaimer,
  logoSrc,
  year,
}: FooterProps) {
  return (
    <footer className="bg-navy-deep text-white">
      <div className="mx-auto max-w-site px-4 py-12 md:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <Logo src={logoSrc} tone="dark" />
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-body text-body-sm text-white/90">
            {phones.map((p) => (
              <li key={p.number} className="flex items-center gap-2">
                <PhoneIcon size={14} className="text-gold" />
                <span className="sr-only">{p.label}: </span>
                <a href={telHref(p.number)} className={cx("hover:underline", focusDark)}>
                  {p.number}
                </a>
              </li>
            ))}
            <li>
              <address className="not-italic">{address}</address>
            </li>
            <li>{dre}</li>
          </ul>
          {newsletter && <div className="w-full max-w-xl">{newsletter}</div>}
          <nav aria-label="Footer">
            <ul className="flex flex-wrap justify-center gap-x-1 gap-y-2">
              {nav.map((n, i) => (
                <li key={n.href} className="flex items-center">
                  {i > 0 && (
                    <span aria-hidden="true" className="mx-2 text-white/60">
                      ·
                    </span>
                  )}
                  <a
                    href={n.href}
                    className={cx(
                      "font-body text-label uppercase tracking-label text-white hover:text-gold",
                      focusDark,
                    )}
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {social && social.length > 0 && (
            <SocialLinks links={social} label="Vabrato on social media" />
          )}
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-site flex-col items-center gap-3 px-4 py-6 text-center font-body text-caption text-white/80 md:px-6">
          {mlsDisclaimer && <div data-slot="mls-disclaimer">{mlsDisclaimer}</div>}
          <div className="flex items-center gap-3">
            <EqualHousingIcon size={24} />
            <span>
              © {year ?? new Date().getFullYear()} Vabrato Real Estate Services. Equal Housing
              Opportunity.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

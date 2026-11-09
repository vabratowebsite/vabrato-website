import type { ComponentType, SVGProps } from "react";
import { cx, focusDark } from "../cx";
import { FacebookIcon, InstagramIcon, LinkedInIcon, XIcon, YouTubeIcon } from "../icons";

export type SocialNetwork = "facebook" | "instagram" | "youtube" | "linkedin" | "x";
export interface SocialLink {
  network: SocialNetwork;
  href: string;
}

export const SOCIAL_ICONS: Record<
  SocialNetwork,
  ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
  linkedin: LinkedInIcon,
  x: XIcon,
};

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
};

/** Row of round social links; used by SocialRail, Footer and AgentHero. */
export function SocialLinks({
  links,
  tone = "dark",
  direction = "row",
  label = "Social media",
}: {
  links: SocialLink[];
  tone?: "dark" | "light";
  direction?: "row" | "column";
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cx("flex gap-2", direction === "column" && "flex-col")}>
      {links.map((l) => {
        const Icon = SOCIAL_ICONS[l.network];
        return (
          <li key={l.network}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(
                "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                tone === "dark"
                  ? cx("border-white/60 text-white hover:bg-white hover:text-navy", focusDark)
                  : "border-navy text-navy hover:bg-navy hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy",
              )}
            >
              <Icon size={14} />
              <span className="sr-only">{SOCIAL_LABELS[l.network]} (opens in a new tab)</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Fixed right-side social icons (desktop only). */
export function SocialRail({ links, fixed = true }: { links: SocialLink[]; fixed?: boolean }) {
  // Only the fixed rail is a page-level landmark; inline previews are a plain div.
  const Tag = fixed ? "aside" : "div";
  return (
    <Tag
      aria-label={fixed ? "Follow Vabrato" : undefined}
      className={cx(
        "z-30 hidden rounded-l-md bg-navy p-2 md:block",
        fixed ? "fixed right-0 top-1/3" : "inline-block",
      )}
    >
      <SocialLinks links={links} direction="column" />
    </Tag>
  );
}

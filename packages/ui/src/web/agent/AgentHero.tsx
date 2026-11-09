import type { ReactNode } from "react";
import { cx, focusDark } from "../cx";
import { CalendarIcon, IdCardIcon, MailIcon, PhoneIcon } from "../icons";
import { buttonClasses } from "../site/Button";
import { SocialLinks, type SocialLink } from "../site/SocialRail";

export interface AgentHeroProps {
  /** Portrait (Vabrato's own team photo) or placeholder node. */
  photo: ReactNode;
  firstName: string;
  lastName: string;
  /** "Broker, J.D., General Contractor" */
  title: string;
  /** ["CA DRE Lic. # 01372898", "GC Lic. # 1088685"] */
  licenses: string[];
  phone: string;
  email: string;
  social?: SocialLink[];
  bookHref: string;
  contactHref: string;
  /** "Contact Mark" */
  contactLabel?: string;
}

/** Agent profile header (mockups 09, 10). */
export function AgentHero({
  photo,
  firstName,
  lastName,
  title,
  licenses,
  phone,
  email,
  social,
  bookHref,
  contactHref,
  contactLabel = `Contact ${firstName}`,
}: AgentHeroProps) {
  return (
    <section className="mx-auto grid max-w-site gap-0 px-4 py-12 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:px-6">
      <div className="relative z-0 aspect-[4/5] overflow-hidden bg-soft">{photo}</div>
      <div className="flex flex-col justify-center md:pl-4">
        <div className="pb-6 pt-6 md:pl-6 md:pt-0">
          <p className="font-body text-label uppercase tracking-wide text-muted">About</p>
          <h1 className="mt-2 font-display text-display-md uppercase leading-none text-navy md:text-display-lg">
            <span className="block">{firstName}</span>
            <span className="block">{lastName}</span>
          </h1>
          <p className="mt-3 font-subhead text-body text-ink">{title}</p>
        </div>
        <div className="relative z-10 bg-navy p-6 text-white md:-ml-16 md:py-8 md:pl-24 md:pr-8">
          <ul className="space-y-3 font-body text-body-sm">
            <li className="flex items-start gap-3">
              <IdCardIcon size={16} className="mt-0.5 flex-none text-gold" />
              <span>{licenses.join("  |  ")}</span>
            </li>
            <li className="flex flex-wrap gap-x-8 gap-y-3">
              <a
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className={cx("flex items-center gap-3 hover:underline", focusDark)}
              >
                <PhoneIcon size={16} className="text-gold" />
                <span className="sr-only">Phone: </span>
                {phone}
              </a>
              <a
                href={`mailto:${email}`}
                className={cx("flex items-center gap-3 hover:underline", focusDark)}
              >
                <MailIcon size={16} className="text-gold" />
                <span className="sr-only">Email: </span>
                {email}
              </a>
            </li>
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            {social && social.length > 0 ? (
              <SocialLinks links={social} label={`${firstName} on social media`} />
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-3">
              <a href={bookHref} className={buttonClasses("ghost-dark", "sm")}>
                <CalendarIcon size={14} />
                Book a call
              </a>
              <a href={contactHref} className={buttonClasses("gold", "sm")}>
                {contactLabel}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx, focusDark, focusLight } from "../cx";

export type ButtonVariant = "outline" | "navy" | "gold" | "ghost-dark";
export type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, string> = {
  outline: cx("border border-navy bg-white text-navy hover:bg-navy hover:text-white", focusLight),
  navy: cx("border border-navy bg-navy text-white hover:bg-navy-deep", focusLight),
  gold: cx("border border-gold bg-gold text-navy hover:brightness-95", focusLight),
  "ghost-dark": cx(
    "border border-white/70 bg-transparent text-white hover:bg-white hover:text-navy",
    focusDark,
  ),
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-[32px] px-4 py-1.5 text-[11px]",
  md: "min-h-[44px] px-6 py-3 text-[12px]",
};

interface Common {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Short underline beneath the button (the vabrato.com outline style). Defaults on for outline. */
  underline?: boolean;
  children: ReactNode;
  className?: string;
}

type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export type ButtonProps = AsButton | AsLink;

export function buttonClasses(variant: ButtonVariant = "outline", size: ButtonSize = "md") {
  return cx(
    "relative inline-flex items-center justify-center gap-2 font-body font-medium uppercase tracking-label transition-colors",
    variants[variant],
    sizes[size],
  );
}

/** Thin uppercase button. Renders an <a> when `href` is given, else a <button>. */
export function Button(props: ButtonProps) {
  const { variant = "outline", size = "md", underline, className, children, ...rest } = props;
  const showUnderline = underline ?? variant === "outline";
  const cls = cx(buttonClasses(variant, size), className);
  const inner = (
    <>
      {children}
      {showUnderline && (
        <span
          aria-hidden="true"
          className={cx(
            "absolute -bottom-[7px] left-1/2 h-px w-10 -translate-x-1/2",
            variant === "ghost-dark" ? "bg-white/70" : "bg-navy",
          )}
        />
      )}
    </>
  );
  if (typeof rest.href === "string") {
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    );
  }
  const { type = "button", ...btn } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={cls} {...btn}>
      {inner}
    </button>
  );
}

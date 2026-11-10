"use client";

import Script from "next/script";

// Cloudflare Turnstile widget, rendered only when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is set (review item 12). Implicit rendering adds a hidden
// `cf-turnstile-response` input to the surrounding form.
export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />
    </>
  );
}

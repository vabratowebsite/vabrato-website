"use client";

import { useEffect, useState } from "react";
import { SiteHeader, type SiteHeaderProps } from "@vabrato/ui/web";

// Public pages stay static and cached, so the signed-in state is read in the
// browser: a Supabase auth cookie means "show My portal". No Supabase client
// or network call on public pages; /my itself checks the session properly.
export const hasAuthCookie = (cookie: string) => /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.0)?=/.test(cookie);

export function MemberAwareHeader(props: Omit<SiteHeaderProps, "signedIn">) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(hasAuthCookie(document.cookie)), []);
  return <SiteHeader {...props} signedIn={signedIn} />;
}

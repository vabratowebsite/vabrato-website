"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { hasAuthCookie } from "./MemberAwareHeader";

// null until mounted; then whether a Supabase auth cookie exists. Read once
// per page here, so a grid of cards doesn't each check (and re-render).
const SignedInContext = createContext<boolean | null | undefined>(undefined);
export const useSignedInContext = () => useContext(SignedInContext);

// TanStack Query for the member islands on public pages and in /my (hearts,
// save search, price history). Server components pass through untouched.
export function MemberQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false, refetchOnWindowFocus: false } } }));
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => setSignedIn(hasAuthCookie(document.cookie)), []);
  return (
    <QueryClientProvider client={client}>
      <SignedInContext.Provider value={signedIn}>{children}</SignedInContext.Provider>
    </QueryClientProvider>
  );
}

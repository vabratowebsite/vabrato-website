"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { hasAuthCookie } from "./cookie";
import { useSignedInContext } from "./components/MemberQueryProvider";

// Client state for member islands. Signed-out visitors make no requests:
// the auth cookie check runs first, and saving sends them to /join.

export function useSignedIn(): boolean | null {
  const fromProvider = useSignedInContext();
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    if (fromProvider === undefined) setLocal(hasAuthCookie(document.cookie));
  }, [fromProvider]);
  return fromProvider === undefined ? local : fromProvider;
}

export const joinHref = () => `/join?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "same-origin", headers: { "content-type": "application/json", ...init?.headers } });
  if (res.status === 401) throw Object.assign(new Error("signed_out"), { status: 401 });
  if (!res.ok) throw Object.assign(new Error((await res.json().catch(() => ({})))?.error ?? "failed"), { status: res.status });
  return res.json() as Promise<T>;
}

const SAVED_KEY = ["my", "saved-homes"] as const;

export function useSavedHomes() {
  const signedIn = useSignedIn();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: SAVED_KEY,
    queryFn: () => api<{ keys: string[] }>("/api/my/saved-homes").then((r) => new Set(r.keys)),
    enabled: signedIn === true,
  });
  const mutation = useMutation({
    mutationFn: ({ key, save }: { key: string; save: boolean }) =>
      api("/api/my/saved-homes", { method: save ? "POST" : "DELETE", body: JSON.stringify({ listingKey: key }) }),
    onMutate: async ({ key, save }) => {
      await qc.cancelQueries({ queryKey: SAVED_KEY });
      const prev = qc.getQueryData<Set<string>>(SAVED_KEY);
      const next = new Set(prev);
      if (save) next.add(key);
      else next.delete(key);
      qc.setQueryData(SAVED_KEY, next);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(SAVED_KEY, ctx?.prev);
      if ((err as { status?: number }).status === 401) window.location.assign(joinHref());
    },
  });

  const signedOut = signedIn === false || (query.error as { status?: number } | null)?.status === 401;
  return {
    /** null until we know whether the member is signed in. */
    ready: signedIn !== null && (signedOut || !query.isPending),
    signedOut,
    isSaved: (key: string) => query.data?.has(key) ?? false,
    toggle: (key: string, save: boolean) => {
      if (signedOut) {
        window.location.assign(joinHref());
        return;
      }
      mutation.mutate({ key, save });
    },
    error: mutation.error ? "We couldn't update your saved homes. Please try again." : null,
  };
}

export function useSaveSearch() {
  return useMutation({
    mutationFn: (query: string) => api<{ id: string; name: string }>("/api/my/saved-searches", { method: "POST", body: JSON.stringify({ query }) }),
  });
}

export type HistoryResponse = {
  events: { at: string; price: number | null; status: string }[];
  sold: { price: number; date: string } | null;
};

/** Price history for VOW members; any refusal (404 flag off, 401, 403) means "show the teaser". */
export function usePriceHistory(listingKey: string) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["my", "history", listingKey],
    queryFn: async (): Promise<{ status: "ok"; data: HistoryResponse } | { status: "locked"; reason: string }> => {
      try {
        return { status: "ok", data: await api<HistoryResponse>(`/api/my/listings/${encodeURIComponent(listingKey)}/history`) };
      } catch (e) {
        const status = (e as { status?: number }).status;
        return { status: "locked", reason: status === 403 ? "terms" : status === 401 ? "signed_out" : "unavailable" };
      }
    },
    enabled: signedIn === true,
  });
}

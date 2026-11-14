"use client";

import { useQuery } from "@tanstack/react-query";
import { SparkleIcon } from "@vabrato/ui/web";
import { useSignedIn } from "../hooks";

// "Ask Vabrato about this home" on a listing page (S5b PR 4): shown only to a
// signed-in buyer while "Ask about a home" is on. It links into the member
// portal; the public page itself carries no AI text, and signed-out
// visitors make no request at all.

export function AskAboutHomeLink({ listingKey, address }: { listingKey: string; address: string }) {
  const signedIn = useSignedIn();
  const status = useQuery({
    queryKey: ["my", "assistant-status"],
    queryFn: async () => {
      const res = await fetch("/api/my/assistant/status", { credentials: "same-origin" });
      return res.ok ? ((await res.json()) as { modes: string[] }) : { modes: [] };
    },
    enabled: signedIn === true,
    staleTime: 60_000,
  });
  if (signedIn !== true || !status.data?.modes.includes("listing")) return null;
  return (
    <a
      href={`/my/assistant?listing=${encodeURIComponent(listingKey)}`}
      className="inline-flex min-h-[44px] items-center gap-2 border border-navy bg-white px-4 font-body text-label font-medium uppercase tracking-label text-navy hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
    >
      <SparkleIcon size={14} />
      Ask Vabrato about this home<span className="sr-only">: {address}</span>
    </a>
  );
}

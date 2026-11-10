"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HeartIcon, ListingCard, type ListingCardProps } from "@vabrato/ui/web";
import { joinHref, useSaveSearch, useSavedHomes, useSignedIn } from "../hooks";

// Save-home hearts and the Save search button on public pages. Signed-out
// visitors go to /join and come back to the same page afterwards.

export function SavableListingCard(props: ListingCardProps & { listingKey: string }) {
  const { listingKey, ...card } = props;
  const saved = useSavedHomes();
  return (
    <ListingCard
      {...card}
      saved={saved.isSaved(listingKey)}
      onToggleSave={(next) => saved.toggle(listingKey, next)}
    />
  );
}

const btn =
  "inline-flex min-h-[44px] items-center gap-2 border px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export function SaveHomeButton({ listingKey, address }: { listingKey: string; address: string }) {
  const saved = useSavedHomes();
  const on = saved.isSaved(listingKey);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => saved.toggle(listingKey, !on)}
        className={`${btn} ${on ? "border-gold bg-gold-50 text-ink" : "border-navy bg-white text-navy hover:bg-navy-50"}`}
      >
        <HeartIcon size={16} filled={on} />
        {on ? "Saved" : "Save"}
        <span className="sr-only"> {address}</span>
      </button>
      {saved.error && (
        <p role="alert" className="font-body text-caption text-red">
          {saved.error}
        </p>
      )}
    </div>
  );
}

export function SaveSearchButton() {
  const signedIn = useSignedIn();
  const save = useSaveSearch();
  const [done, setDone] = useState<string | null>(null);

  const onClick = () => {
    if (signedIn === false) return window.location.assign(joinHref());
    save.mutate(window.location.search, {
      onSuccess: (r) => setDone(r.name),
      onError: (e) => {
        if ((e as { status?: number }).status === 401) window.location.assign(joinHref());
      },
    });
  };
  const limit = (save.error as { message?: string } | null)?.message === "limit";

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={onClick} disabled={save.isPending} className={`${btn} border-navy bg-navy text-white hover:bg-navy-deep disabled:opacity-60`}>
        Save search
      </button>
      <p role="status" aria-live="polite" className="font-body text-caption text-ink">
        {done ? (
          <>
            Saved as &ldquo;{done}&rdquo;.{" "}
            <a href="/my/searches" className="text-navy underline">
              Manage saved searches
            </a>
          </>
        ) : save.isError ? (
          <span className="text-red">{limit ? "You have 25 saved searches. Delete one to save another." : "We couldn't save this search. Please try again."}</span>
        ) : null}
      </p>
    </div>
  );
}

/** "No longer on the market" rows on /my/saved. */
export function RemoveSavedButton({ listingKey }: { listingKey: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/my/saved-homes", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingKey }) });
        if (res.ok) {
          await qc.invalidateQueries({ queryKey: ["my", "saved-homes"] });
          router.refresh();
        } else setBusy(false);
      }}
      className={`${btn} border-navy bg-white text-navy hover:bg-navy-50 disabled:opacity-60`}
    >
      Remove<span className="sr-only"> listing {listingKey}</span>
    </button>
  );
}

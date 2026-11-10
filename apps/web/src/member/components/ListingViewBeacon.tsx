"use client";

import { useEffect } from "react";

// Counts one view of one of Vabrato's own listings (the server decides; see
// /api/listing-view). Rendered only on vabrato.com, only for our listings.
export function ListingViewBeacon({ listingKey }: { listingKey: string }) {
  useEffect(() => {
    void fetch("/api/listing-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: listingKey }),
      keepalive: true,
    }).catch(() => undefined);
  }, [listingKey]);
  return null;
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { pinBounds, type MapPin } from "@/lib/map-pins";

// Map search (mockup 02). Rendered only when NEXT_PUBLIC_MAPBOX_TOKEN is set;
// mapbox-gl loads after the page (dynamic import) to keep the list fast. The
// result list is the accessible equivalent of the map.

export function SearchMap({ pins }: { pins: MapPin[] }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const [moved, setMoved] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (!token || !ref.current) return;
    let cancelled = false;
    const markers: import("mapbox-gl").Marker[] = [];
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (cancelled || !ref.current) return;
      mapboxgl.accessToken = token;
      const bounds = pinBounds(pins);
      const map = new mapboxgl.Map({
        container: ref.current,
        style: "mapbox://styles/mapbox/light-v11",
        ...(bounds ? { bounds, fitBoundsOptions: { padding: 40 } } : { center: [-122.26, 37.5], zoom: 10 }),
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      for (const p of pins) {
        const el = document.createElement("a");
        el.href = p.href;
        el.textContent = p.label;
        el.setAttribute("aria-label", `${p.title}, ${p.label}`);
        el.className = p.ours
          ? "rounded-sm bg-gold px-2 py-0.5 font-body text-[12px] font-bold text-ink shadow-card"
          : "rounded-sm bg-navy px-2 py-0.5 font-body text-[12px] font-bold text-white shadow-card";
        markers.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
      }
      map.on("moveend", (e) => {
        if ((e as { originalEvent?: unknown }).originalEvent) setMoved(true);
      });
    })();
    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token, pins]);

  if (!token) return null;

  const searchHere = () => {
    const b = mapRef.current?.getBounds();
    if (!b) return;
    const next = new URLSearchParams(params.toString());
    next.set("bbox", [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(4)).join(","));
    next.delete("page");
    router.push(`/search?${next.toString()}`);
    setMoved(false);
  };

  return (
    <div className="relative h-[420px] w-full lg:sticky lg:top-0 lg:h-[calc(100vh-120px)]">
      <a href="#results" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:bg-white focus:px-3 focus:py-2 focus:text-navy">
        Skip map, go to results
      </a>
      <div ref={ref} role="region" aria-label="Map of results" className="h-full w-full bg-navy-50" />
      {moved && (
        <button
          type="button"
          onClick={searchHere}
          className="absolute left-1/2 top-3 -translate-x-1/2 bg-white px-4 py-2 font-body text-body-sm font-medium text-navy shadow-card focus:outline-none focus:ring-2 focus:ring-navy"
        >
          Search this area
        </button>
      )}
    </div>
  );
}

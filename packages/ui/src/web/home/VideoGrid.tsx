import type { ReactNode } from "react";
import { VideoThumb } from "./VideoFeature";

export interface VideoItem {
  title: string;
  youtubeUrl: string;
  poster: ReactNode;
  /** "YouTube · Sample date" */
  meta?: string;
}

/** Latest-videos grid (mockup 01). */
export function VideoGrid({ items }: { items: VideoItem[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((v) => (
        <li key={v.youtubeUrl + v.title}>
          <VideoThumb poster={v.poster} youtubeUrl={v.youtubeUrl} title={v.title} size="md" />
          <h3 className="mt-3 font-subhead text-body-sm text-ink">{v.title}</h3>
          {v.meta && <p className="font-body text-caption text-muted">{v.meta}</p>}
        </li>
      ))}
    </ul>
  );
}

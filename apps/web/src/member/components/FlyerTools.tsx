"use client";

import { useState, useTransition } from "react";
import { deleteFlyerAction } from "@/app/my/flyers/actions";
import { postGraphicSvg, svgDataUrl, type PostGraphic } from "../design-svg";
import { downloadPng } from "./svg-download";

// Small client pieces for My flyers (S5b PR 6): delete, print, copy a post,
// and the post graphic (our own template, no photo).

const btn =
  "inline-flex min-h-[44px] items-center justify-center px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";
const secondary = `${btn} border border-navy bg-white text-navy hover:bg-navy-50`;

export function DeleteFlyer({ id, headline }: { id: string; headline: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete: ${headline}`}
        className={secondary}
        onClick={() =>
          start(async () => {
            if (!window.confirm(`Delete "${headline}"?`)) return;
            const r = await deleteFlyerAction(id).catch(() => ({ ok: false, error: "That didn't work. Please try again." }));
            if (!r.ok) setMsg(r.error ?? "That didn't work.");
          })
        }
      >
        Delete
      </button>
      {msg && (
        <span role="alert" className="text-body-sm font-medium text-red">
          {msg}
        </span>
      )}
    </span>
  );
}

export function PrintFlyer() {
  return (
    <button type="button" className={`${btn} bg-navy text-white hover:bg-navy-deep`} onClick={() => window.print()}>
      Print the flyer
    </button>
  );
}

export function CopyPost({ label, text }: { label: string; text: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={secondary}
        onClick={() =>
          navigator.clipboard
            .writeText(text)
            .then(() => setMsg({ ok: true, text: "Copied." }))
            .catch(() => setMsg({ ok: false, text: "Couldn't copy: select the text and copy it instead." }))
        }
      >
        Copy the {label} post
      </button>
      {msg && (
        <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-body-sm text-green" : "text-body-sm font-medium text-red"}>
          {msg.text}
        </span>
      )}
    </span>
  );
}

export function PostGraphicDownload({ graphic, file }: { graphic: PostGraphic; file: string }) {
  const svg = postGraphicSvg(graphic);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {/* Our own SVG, shown as an image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgDataUrl(svg)} alt={`Post graphic: ${graphic.kind === "open_house" ? "Open house" : "Just listed"} in ${graphic.city}${graphic.when ? `, ${graphic.when}` : ""}`} className="h-auto w-full max-w-xs border border-line" />
      <button type="button" className={secondary} onClick={() => downloadPng(file, svg).catch(() => setErr("The image couldn't be made. Please try again."))}>
        Download the post image (PNG)
      </button>
      {err && (
        <p role="alert" className="text-body-sm font-medium text-red">
          {err}
        </p>
      )}
    </div>
  );
}

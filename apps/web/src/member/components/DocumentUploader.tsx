"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { createBrowserSupabase } from "@vabrato/lib";
import { ACCEPT_ATTRIBUTE, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "../documents";

// Upload to the member's own folder: get a signed upload URL, send the file
// straight to storage, then ask the server to check it (its bytes decide the
// type). A native file input does the work; the drop zone is a shortcut.

const ERRORS: Record<string, string> = {
  too_large: "That file is over 20 MB. Please upload a smaller copy.",
  type: "That file type isn't accepted. Upload a PDF or a photo (JPG, PNG, WebP, HEIC).",
  signed_out: "Your session ended. Please sign in again.",
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) throw new Error(data.error ?? (res.status === 401 ? "signed_out" : "failed"));
  return data;
}

export function DocumentUploader() {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "done" | "error"; text?: string }>({ kind: "idle" });
  const [over, setOver] = useState(false);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) return setStatus({ kind: "error", text: ERRORS.too_large });
    const type = file.type || (/\.heic$/i.test(file.name) ? "image/heic" : "");
    if (!(DOCUMENT_TYPES as readonly string[]).includes(type)) return setStatus({ kind: "error", text: ERRORS.type });
    setStatus({ kind: "busy", text: `Uploading ${file.name}…` });
    try {
      const { path, token } = await post("/api/my/documents/upload-url", { name: file.name, size: file.size, type });
      const { error } = await createBrowserSupabase().storage.from("member-docs").uploadToSignedUrl(path!, token!, file, { contentType: type });
      if (error) throw new Error("failed");
      await post("/api/my/documents/complete", { path, name: file.name });
      setStatus({ kind: "done", text: `${file.name} uploaded.` });
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", text: ERRORS[(e as Error).message] ?? "The upload didn't finish. Please try again." });
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}
      className={`space-y-3 border-2 border-dashed p-6 font-body ${over ? "border-navy bg-navy-50" : "border-muted bg-white"}`}
    >
      <label htmlFor={inputId} className="block text-body-sm font-medium text-ink">
        Upload a document
      </label>
      <p id={`${inputId}-hint`} className="text-caption text-muted">
        PDF or photo (JPG, PNG, WebP, HEIC), up to 20 MB. You can also drop a file here.
      </p>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        aria-describedby={`${inputId}-hint`}
        disabled={status.kind === "busy"}
        onChange={(e) => void upload(e.target.files)}
        className="block w-full text-body-sm text-ink file:mr-4 file:min-h-[44px] file:border file:border-navy file:bg-white file:px-4 file:font-body file:text-label file:uppercase file:tracking-label file:text-navy"
      />
      <p role={status.kind === "error" ? "alert" : "status"} aria-live="polite" className={`text-body-sm ${status.kind === "error" ? "font-medium text-red" : "text-ink"}`}>
        {status.text ?? ""}
      </p>
    </div>
  );
}

export function DeleteDocumentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/my/documents/${id}`, { method: "DELETE", credentials: "same-origin" });
        if (res.ok) router.refresh();
        else setBusy(false);
      }}
      className="min-h-[44px] px-3 font-body text-body-sm text-navy underline disabled:opacity-60"
    >
      Delete<span className="sr-only"> {name}</span>
    </button>
  );
}

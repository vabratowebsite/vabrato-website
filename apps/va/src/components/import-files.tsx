"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DOC_TYPES, DOC_TYPE_KEYS } from "@vabrato/lib";
import { Pill } from "@vabrato/ui/web";
import { btnPrimary, btnSecondary, errorCls, inputCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { drivePickerTokenAction, importDocumentsAction, importReceiptFileAction, listDropboxAction, type DropboxEntry, type ImportLine } from "@/lib/import-actions";

// Import from Google Drive or Dropbox (Integrations PR 2) on a deal's
// Documents or Receipts. Drive opens Google's picker with a short-lived,
// Drive-only token (the console can open only the files picked); Dropbox
// lists the Apps/Vabrato folder. The server fetches each file and checks it
// like an upload.

export type ImportState = "ready" | "connect" | "off";
export interface ImportedReceipt {
  path: string;
  ref: string;
  name: string;
}

interface PickerDoc {
  id: string;
  name?: string;
}
interface PickerApi {
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  DocsView: new (id: string) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMimeTypes(m: string): unknown };
  PickerBuilder: new () => PickerBuilder;
}
interface PickerBuilder {
  addView(v: unknown): PickerBuilder;
  enableFeature(f: string): PickerBuilder;
  setMaxItems(n: number): PickerBuilder;
  setOAuthToken(t: string): PickerBuilder;
  setDeveloperKey(k: string): PickerBuilder;
  setAppId(a: string): PickerBuilder;
  setOrigin(o: string): PickerBuilder;
  setTitle(t: string): PickerBuilder;
  setCallback(cb: (data: { action: string; docs?: PickerDoc[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
type PickerWindow = Window & { gapi?: { load(name: string, opts: { callback: () => void }): void }; google?: { picker?: PickerApi } };

let scriptLoading: Promise<void> | null = null;
function loadPickerScript(src: string): Promise<void> {
  const w = window as PickerWindow;
  if (w.gapi) return Promise.resolve();
  scriptLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoading = null;
      reject(new Error("picker script"));
    };
    document.head.appendChild(s);
  });
  return scriptLoading;
}

const DOC_MIME = "application/pdf,image/jpeg,image/png";
const RECEIPT_MIME = "application/pdf,image/jpeg,image/png,image/webp";
const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function ImportFiles({
  dealId,
  target,
  drive,
  dropbox,
  onReceipt,
}: {
  dealId: string;
  target: "documents" | "receipt";
  drive: ImportState;
  dropbox: ImportState;
  onReceipt?: (r: ImportedReceipt) => void;
}) {
  const uid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [lines, setLines] = useState<ImportLine[]>([]);
  const [list, setList] = useState<{ files: DropboxEntry[]; more: boolean } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  if (drive === "off" && dropbox === "off") return null;

  const reset = () => {
    setNote(null);
    setLines([]);
  };

  async function importIds(source: "drive" | "dropbox", ids: string[]) {
    if (!ids.length) return;
    if (target === "receipt") {
      const r = await importReceiptFileAction(dealId, source, ids[0]!);
      if (!r.ok) return setNote({ kind: "error", text: r.error });
      onReceipt?.({ path: r.path, ref: r.ref, name: r.name });
      setNote({ kind: "ok", text: `Imported ${r.name}. Fill in the receipt below and add it.` });
      return;
    }
    const r = await importDocumentsAction(dealId, source, ids, type);
    if (!r.ok) return setNote({ kind: "error", text: r.error });
    setLines(r.lines);
    const n = r.lines.filter((l) => l.ok).length;
    setNote({ kind: n ? "ok" : "error", text: n ? `Imported ${n} of ${r.lines.length} file${r.lines.length === 1 ? "" : "s"}.` : "Nothing was imported." });
    if (n) router.refresh();
  }

  async function openDrive() {
    reset();
    setList(null);
    setBusy(true);
    try {
      const r = await drivePickerTokenAction(dealId);
      if (!r.ok) {
        setNote({ kind: "error", text: r.error });
        return setBusy(false);
      }
      await loadPickerScript(r.scriptUrl);
      const w = window as PickerWindow;
      w.gapi!.load("picker", {
        callback: () => {
          const g = w.google!.picker!;
          const view = new g.DocsView(g.ViewId.DOCS);
          view.setIncludeFolders(false);
          view.setSelectFolderEnabled(false);
          view.setMimeTypes(target === "receipt" ? RECEIPT_MIME : DOC_MIME);
          let b = new g.PickerBuilder()
            .addView(view)
            .setOAuthToken(r.token)
            .setDeveloperKey(r.apiKey)
            .setAppId(r.appId)
            .setOrigin(window.location.origin)
            .setTitle(target === "receipt" ? "Pick the receipt" : "Pick up to 10 files")
            .setCallback(async (data) => {
              if (data.action === "picked") {
                setNote({ kind: "ok", text: "Importing…" });
                try {
                  await importIds("drive", (data.docs ?? []).map((d) => d.id).slice(0, 10));
                } catch {
                  setNote({ kind: "error", text: "Something went wrong importing. Try again." });
                } finally {
                  setBusy(false);
                }
              } else if (data.action === "cancel") setBusy(false);
            });
          if (target === "documents") b = b.enableFeature(g.Feature.MULTISELECT_ENABLED).setMaxItems(10);
          b.build().setVisible(true);
        },
      });
    } catch {
      setNote({ kind: "error", text: "Google's file picker didn't load. Try again." });
      setBusy(false);
    }
  }

  async function openDropbox() {
    reset();
    setPicked([]);
    setBusy(true);
    try {
      const r = await listDropboxAction(dealId, target);
      if (!r.ok) return setNote({ kind: "error", text: r.error });
      setList({ files: r.files, more: r.more });
      if (!r.files.length) setNote({ kind: "ok", text: "Your Apps/Vabrato folder in Dropbox is empty. Put files there, then try again." });
    } catch {
      setNote({ kind: "error", text: "Dropbox couldn't be reached. Try again in a few minutes." });
    } finally {
      setBusy(false);
    }
  }

  async function importPicked() {
    if (!picked.length || busy) return;
    setBusy(true);
    setNote({ kind: "ok", text: "Importing…" });
    try {
      await importIds("dropbox", picked);
      setList(null);
      setPicked([]);
    } catch {
      setNote({ kind: "error", text: "Something went wrong importing. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string, on: boolean) => setPicked((p) => (target === "receipt" ? (on ? [id] : []) : on ? [...p, id].slice(0, 10) : p.filter((x) => x !== id)));

  return (
    <div className="space-y-4 border-t border-line pt-4">
      <p className="font-body text-body-sm font-medium text-ink">{target === "receipt" ? "Or import the receipt" : "Or import files"}</p>
      {target === "documents" && (drive === "ready" || dropbox === "ready") && (
        <div className="max-w-sm">
          <label htmlFor={`${uid}-type`} className={labelCls}>
            What are they? (optional, for every file imported)
          </label>
          <select id={`${uid}-type`} value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">Choose later</option>
            {DOC_TYPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {DOC_TYPES[k]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {drive === "ready" && (
          <button type="button" className={btnSecondary} disabled={busy} onClick={openDrive}>
            Import from Google Drive
          </button>
        )}
        {dropbox === "ready" && (
          <button type="button" className={btnSecondary} disabled={busy} onClick={openDropbox}>
            Import from Dropbox
          </button>
        )}
      </div>
      {(drive === "connect" || dropbox === "connect") && (
        <p className={mutedCls}>
          {drive === "connect" && dropbox === "connect" ? "Google Drive and Dropbox imports need" : drive === "connect" ? "Google Drive import needs" : "Dropbox import needs"} your account connected first:{" "}
          <Link href="/settings" className="text-navy underline">
            connect in Settings
          </Link>
          .
        </p>
      )}

      {list && list.files.length > 0 && (
        <fieldset className="border border-line p-3">
          <legend className="px-1 font-body text-body-sm font-medium text-ink">
            {target === "receipt" ? "Pick the receipt in Apps/Vabrato" : "Pick files in Apps/Vabrato (up to 10)"} · {picked.length} picked
          </legend>
          <ul className="divide-y divide-line">
            {list.files.map((f) => (
              <li key={f.id} className="flex min-h-[44px] flex-wrap items-center gap-2 py-1">
                <input
                  id={`${uid}-${f.id}`}
                  type={target === "receipt" ? "radio" : "checkbox"}
                  name={`${uid}-dropbox`}
                  disabled={f.imported || busy}
                  checked={picked.includes(f.id)}
                  onChange={(e) => toggle(f.id, e.target.checked)}
                  className="h-5 w-5"
                />
                <label htmlFor={`${uid}-${f.id}`} className="min-w-0 flex-1 font-body text-body-sm text-ink [overflow-wrap:anywhere]">
                  {f.name} <span className="text-muted">· {sizeText(f.size)}</span>
                </label>
                {f.imported && <Pill tone="neutral">Imported</Pill>}
              </li>
            ))}
          </ul>
          {list.more && <p className={`${mutedCls} mt-2`}>Only the newest 500 files are listed.</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={btnPrimary} disabled={!picked.length || busy} onClick={importPicked}>
              {busy ? "Importing…" : target === "receipt" ? "Import this receipt" : `Import ${picked.length || ""} file${picked.length === 1 ? "" : "s"}`.replace("  ", " ")}
            </button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => setList(null)}>
              Close
            </button>
          </div>
        </fieldset>
      )}

      <div aria-live="polite">
        {note && (
          <p role={note.kind === "error" ? "alert" : "status"} className={note.kind === "error" ? errorCls : okCls}>
            {note.text}
          </p>
        )}
        {lines.length > 0 && (
          <ul className="mt-2 space-y-1 font-body text-body-sm text-ink">
            {lines.map((l, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                <span className={l.ok ? "text-green" : "text-red"}>{l.ok ? "Imported" : "Not imported"}</span>: {l.name}. {l.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

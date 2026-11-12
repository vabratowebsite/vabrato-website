"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, btnSecondary, errorCls, inputCls, labelCls, linkAction, linkDanger, mutedCls, okCls } from "@/components/ui";
import { mailtoHref } from "@/lib/draft-kinds";
import { DECISIONS, SEVERITIES, TRADES, composeLetter, defaultDecisions, letterList, type DecisionRow, type RepairItem, type TradeKey } from "@/lib/repair-kinds";
import {
  discardDraftAction,
  markResponseUsedAction,
  reviseItemsAction,
  saveItemsAction,
  saveResponseAction,
  startRepairItemsAction,
  writeResponseAction,
  type RepairResult,
} from "@/lib/repair-actions";

// S6b PR 7b: the Repairs screens. Items are edited here and approved by the
// agent; the response's item list is our code's (letterList), shown read-only;
// only the opening and closing are editable text.

type Status = { kind: "ok" | "error"; text: string; problems?: string[] } | null;
const show = (r: RepairResult): Status => (r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error, problems: r.problems });

/** Over this, an email link may not open everywhere: copy instead (SMALL 14). */
export const MAILTO_MAX = 1800;

function StatusLine({ status }: { status: Status }) {
  return (
    <div aria-live="polite">
      {status?.kind === "ok" && (
        <p role="status" className={okCls}>
          {status.text}
        </p>
      )}
      {status?.kind === "error" && (
        <div role="alert" className={errorCls}>
          <p>{status.text}</p>
          {status.problems?.length ? (
            <ul className="mt-1 list-disc pl-5">
              {status.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

const SEVERITY_LABEL: Record<(typeof SEVERITIES)[number], string> = { safety: "Safety", repair: "Repair", maintenance: "Maintenance", monitor: "Monitor" };
const DECISION_LABEL: Record<(typeof DECISIONS)[number], string> = { not_requested: "Not requested", repair: "Repair", credit: "Credit", decline: "Decline" };

/** On the Documents tab: read an inspection report into repair items (or open its list in progress). */
export function StartRepairItems({ dealId, documentId, name }: { dealId: string; documentId: string; name: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className={linkAction}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setStatus({ kind: "ok", text: "Reading the report. This can take a minute or two." });
            const r = await startRepairItemsAction(dealId, documentId);
            setStatus(show(r));
            if (r.ok) router.push(`/deals/${dealId}/repairs/${r.id}`);
          })
        }
      >
        Repair items<span className="sr-only"> from {name}</span>
      </button>
      <StatusLine status={status} />
    </span>
  );
}

const blank = (): RepairItem => ({ id: `new-${Math.random().toString(36).slice(2)}`, title: "", detail: "", location: "", severity: "repair", severity_label: "", trade: "general", page: null, added: true });

/** The items list while it's a draft: edit, remove, add; save or approve. */
export function ItemsEditor({ dealId, id, initial }: { dealId: string; id: string; initial: RepairItem[] }) {
  const uid = useId();
  const router = useRouter();
  const [items, setItems] = useState<RepairItem[]>(initial);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const set = (n: number, patch: Partial<RepairItem>) => setItems((all) => all.map((it, i) => (i === n ? { ...it, ...patch } : it)));
  const run = (fn: () => Promise<RepairResult>, after?: (r: RepairResult) => void) =>
    start(async () => {
      setStatus(null);
      const r = await fn();
      setStatus(show(r));
      if (r.ok) {
        after?.(r);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {items.map((it, n) => (
          <li key={it.id} className="border border-line p-3">
            <fieldset>
              <legend className="font-body text-body-sm font-medium text-ink">
                Item {n + 1}
                {it.added ? " (added by you)" : it.page ? ` · report page ${it.page}` : ""}
              </legend>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor={`${uid}-${n}-title`} className={labelCls}>
                    Title
                  </label>
                  <input id={`${uid}-${n}-title`} value={it.title} maxLength={120} onChange={(e) => set(n, { title: e.target.value })} className={`${inputCls} mt-1`} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={`${uid}-${n}-detail`} className={labelCls}>
                    Detail
                  </label>
                  <textarea id={`${uid}-${n}-detail`} value={it.detail} maxLength={300} rows={2} onChange={(e) => set(n, { detail: e.target.value })} className={`${inputCls} mt-1`} />
                </div>
                <div>
                  <label htmlFor={`${uid}-${n}-location`} className={labelCls}>
                    Location
                  </label>
                  <input id={`${uid}-${n}-location`} value={it.location} maxLength={80} onChange={(e) => set(n, { location: e.target.value })} className={`${inputCls} mt-1`} />
                </div>
                <div>
                  <label htmlFor={`${uid}-${n}-trade`} className={labelCls}>
                    Trade
                  </label>
                  <select id={`${uid}-${n}-trade`} value={it.trade} onChange={(e) => set(n, { trade: e.target.value as TradeKey })} className={`${inputCls} mt-1`}>
                    {TRADES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${uid}-${n}-severity`} className={labelCls}>
                    Severity
                  </label>
                  <select id={`${uid}-${n}-severity`} value={it.severity} onChange={(e) => set(n, { severity: e.target.value as RepairItem["severity"] })} className={`${inputCls} mt-1`}>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {SEVERITY_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${uid}-${n}-label`} className={labelCls}>
                    The report&apos;s words (optional)
                  </label>
                  <input id={`${uid}-${n}-label`} value={it.severity_label} maxLength={40} onChange={(e) => set(n, { severity_label: e.target.value })} className={`${inputCls} mt-1`} />
                </div>
                <div>
                  <label htmlFor={`${uid}-${n}-page`} className={labelCls}>
                    Report page (optional)
                  </label>
                  <input
                    id={`${uid}-${n}-page`}
                    inputMode="numeric"
                    value={it.page ?? ""}
                    onChange={(e) => set(n, { page: /^\d{1,4}$/.test(e.target.value) && Number(e.target.value) >= 1 ? Number(e.target.value) : null })}
                    className={`${inputCls} mt-1`}
                  />
                </div>
              </div>
              <button type="button" className={`${linkDanger} mt-2`} onClick={() => setItems((all) => all.filter((_, i) => i !== n))}>
                Remove<span className="sr-only"> item {n + 1}: {it.title}</span>
              </button>
            </fieldset>
          </li>
        ))}
      </ol>
      <button type="button" className={btnSecondary} onClick={() => setItems((all) => [...all, blank()])}>
        Add an item
      </button>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => saveItemsAction(dealId, id, items, false))}>
          Save
        </button>
        <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => saveItemsAction(dealId, id, items, true))}>
          Approve the list
        </button>
        <button
          type="button"
          className={linkDanger}
          disabled={pending}
          onClick={() => {
            if (window.confirm("Discard this list? It can't be undone.")) run(() => discardDraftAction(dealId, id), () => router.push(`/deals/${dealId}/repairs`));
          }}
        >
          Discard
        </button>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

export function ReviseButton({ dealId, id }: { dealId: string; id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        className={btnSecondary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await reviseItemsAction(dealId, id);
            setStatus(show(r));
            if (r.ok) router.push(`/deals/${dealId}/repairs/${r.id}`);
          })
        }
      >
        Revise
      </button>
      <StatusLine status={status} />
    </div>
  );
}

/** The seller's decisions on each item (all start as not requested), then the response is written. */
export function DecisionsForm({ dealId, itemsId, items, agentName }: { dealId: string; itemsId: string; items: RepairItem[]; agentName: string }) {
  const uid = useId();
  const router = useRouter();
  const [rows, setRows] = useState<DecisionRow[]>(() => defaultDecisions(items));
  const [approved, setApproved] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const set = (n: number, patch: Partial<DecisionRow>) => setRows((all) => all.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  const preview = useMemo(() => (rows.some((r) => r.decision !== "not_requested") ? letterList(rows) : ""), [rows]);
  void agentName;

  return (
    <div className="space-y-4">
      <p className={mutedCls}>Every item starts as not requested and stays out of the response. Mark the ones the buyer asked for, as the seller decided.</p>
      <ol className="space-y-3">
        {rows.map((r, n) => (
          <li key={r.id} className="flex flex-col gap-2 border border-line p-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              {r.added ? (
                <>
                  <label htmlFor={`${uid}-${n}-t`} className={labelCls}>
                    Item not in the report
                  </label>
                  <input id={`${uid}-${n}-t`} value={r.title} maxLength={120} onChange={(e) => set(n, { title: e.target.value })} className={`${inputCls} mt-1`} />
                </>
              ) : (
                <p className="font-body text-body-sm text-ink">{r.title}</p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={`${uid}-${n}-d`} className={labelCls}>
                  Decision<span className="sr-only"> for {r.title || `item ${n + 1}`}</span>
                </label>
                <select id={`${uid}-${n}-d`} value={r.decision} onChange={(e) => set(n, { decision: e.target.value as DecisionRow["decision"], amount: e.target.value === "credit" ? r.amount : null })} className={`${inputCls} mt-1`}>
                  {DECISIONS.map((d) => (
                    <option key={d} value={d}>
                      {DECISION_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
              {r.decision === "credit" && (
                <div>
                  <label htmlFor={`${uid}-${n}-a`} className={labelCls}>
                    Credit ($)<span className="sr-only"> for {r.title || `item ${n + 1}`}</span>
                  </label>
                  <input
                    id={`${uid}-${n}-a`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={r.amount ?? ""}
                    onChange={(e) => set(n, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className={`${inputCls} mt-1 w-36`}
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className={btnSecondary} onClick={() => setRows((all) => [...all, { id: `added-${all.length + 1}`, title: "", decision: "repair", amount: null, added: true }])}>
        Add an item that isn&apos;t in the report
      </button>
      {preview && (
        <section aria-label="The item list in the response" className="border border-line bg-navy-50 p-3">
          <p className="font-body text-body-sm font-medium text-ink">The console writes this part:</p>
          <pre className="mt-2 whitespace-pre-wrap font-body text-body-sm text-ink">{preview}</pre>
        </section>
      )}
      <div>
        <label htmlFor={`${uid}-note`} className={labelCls}>
          Anything the opening or closing should say? (optional)
        </label>
        <textarea id={`${uid}-note`} value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-1`} />
      </div>
      <div className="flex min-h-[44px] items-center gap-2">
        <input id={`${uid}-ok`} type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="h-5 w-5" />
        <label htmlFor={`${uid}-ok`} className="font-body text-body-sm text-ink">
          The seller has approved these decisions
        </label>
      </div>
      <button
        type="button"
        className={btnPrimary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setStatus({ kind: "ok", text: "Writing the response…" });
            const r = await writeResponseAction(dealId, itemsId, rows, approved, note);
            setStatus(show(r));
            if (r.ok) router.refresh();
          })
        }
      >
        Write the response
      </button>
      <StatusLine status={status} />
    </div>
  );
}

/** A response: while a draft, the opening and closing are editable; once approved, copy, email or print. */
export function ResponseEditor(props: { dealId: string; id: string; status: string; subject: string; opening: string; closing: string; decisions: DecisionRow[]; agentName: string; sentVia: string | null }) {
  const { dealId, id } = props;
  const uid = useId();
  const router = useRouter();
  const [opening, setOpening] = useState(props.opening);
  const [closing, setClosing] = useState(props.closing);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const letter = composeLetter({ opening, closing, rows: props.decisions, agentName: props.agentName });
  const href = mailtoHref([], props.subject, letter);
  const run = (approve: boolean) =>
    start(async () => {
      setStatus(null);
      const r = await saveResponseAction(dealId, id, opening, closing, approve);
      setStatus(show(r));
      if (r.ok) router.refresh();
    });

  if (props.status !== "draft")
    return (
      <div className="space-y-3">
        <pre className="whitespace-pre-wrap border border-line p-3 font-body text-body-sm text-ink">{letter}</pre>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btnPrimary}
            onClick={async () => {
              await navigator.clipboard.writeText(`${props.subject}\n\n${letter}`);
              setStatus({ kind: "ok", text: "Copied." });
              await markResponseUsedAction(dealId, id, "copy");
            }}
          >
            Copy
          </button>
          {href.length <= MAILTO_MAX ? (
            <a href={href} onClick={() => void markResponseUsedAction(dealId, id, "email")} className={btnSecondary}>
              Open in email
            </a>
          ) : (
            <p className={mutedCls}>Too long for an email link: copy it into your email instead.</p>
          )}
          <a href={`/deals/${dealId}/repairs/response/${id}`} onClick={() => void markResponseUsedAction(dealId, id, "print")} className={btnSecondary}>
            Print
          </a>
        </div>
        <p className={mutedCls}>There&apos;s no address filled in: send it to the buyer&apos;s agent yourself. Nothing is sent by the console.</p>
        <StatusLine status={status} />
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="font-body text-body-sm text-ink">Hello,</p>
      <div>
        <label htmlFor={`${uid}-open`} className={labelCls}>
          Opening (written by the assistant; edit it)
        </label>
        <textarea id={`${uid}-open`} value={opening} maxLength={1500} rows={3} onChange={(e) => setOpening(e.target.value)} className={`${inputCls} mt-1`} />
      </div>
      <section aria-label="The item list (written by the console)" className="border border-line bg-navy-50 p-3">
        <pre className="whitespace-pre-wrap font-body text-body-sm text-ink">{letterList(props.decisions)}</pre>
      </section>
      <div>
        <label htmlFor={`${uid}-close`} className={labelCls}>
          Closing (written by the assistant; edit it)
        </label>
        <textarea id={`${uid}-close`} value={closing} maxLength={1000} rows={2} onChange={(e) => setClosing(e.target.value)} className={`${inputCls} mt-1`} />
      </div>
      <p className="font-body text-body-sm text-ink">{props.agentName || "Vabrato Real Estate Services"}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(false)}>
          Save
        </button>
        <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(true)}>
          Approve
        </button>
        <button
          type="button"
          className={linkDanger}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await discardDraftAction(dealId, id);
              setStatus(show(r));
              if (r.ok) router.refresh();
            })
          }
        >
          Discard
        </button>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

/** With the vendor switch off: our code's list for a trade, to copy or open in email (no AI). */
export function TradeRequest({ text, vendors }: { text: string; vendors: { id: string; name: string; email: string | null }[] }) {
  const uid = useId();
  const [vendorId, setVendorId] = useState(vendors.find((v) => v.email)?.id ?? "");
  const [copied, setCopied] = useState(false);
  const vendor = vendors.find((v) => v.id === vendorId);
  const href = mailtoHref(vendor?.email ? [vendor.email] : [], text.split("\n")[0] ?? "Quote request", text);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {vendors.length > 0 && (
          <div>
            <label htmlFor={`${uid}-v`} className={labelCls}>
              Vendor
            </label>
            <select id={`${uid}-v`} value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={`${inputCls} mt-1`}>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.email ? "" : " (no email)"}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          className={btnSecondary}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          Copy the items for this trade
        </button>
        {href.length <= MAILTO_MAX && vendor?.email ? (
          <a href={href} className={btnSecondary}>
            Open in email<span className="sr-only"> to {vendor.name}</span>
          </a>
        ) : null}
      </div>
      <div aria-live="polite">{copied && <p role="status" className={okCls}>Copied.</p>}</div>
    </div>
  );
}

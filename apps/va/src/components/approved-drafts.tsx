import { DRAFT_KINDS, SENT_VIA_LABEL } from "@/lib/draft-kinds";
import type { ApprovedDraft } from "@/lib/draft-data";
import { fmtWhen } from "@/lib/today";
import { mutedCls } from "./ui";

// Approved AI drafts kept with a lead or transaction (S6b PR 3): who
// approved each, when, and how it was sent. The text opens on request.

export function ApprovedDrafts({ drafts }: { drafts: ApprovedDraft[] }) {
  if (!drafts.length) return null;
  return (
    <section aria-label="Approved drafts" className="mt-6 border-t border-line pt-4">
      <h3 className="font-body text-body-md font-medium text-ink">Approved drafts</h3>
      <ul className="mt-2 space-y-2">
        {drafts.map((d) => (
          <li key={d.id} className="border border-line p-3 font-body text-body-sm text-ink">
            <details>
              <summary className="cursor-pointer">
                <span className="font-medium">{d.subject || "(no subject)"}</span>
                <span className={`${mutedCls} block`}>
                  {DRAFT_KINDS[d.kind].one} · approved by {d.by} {fmtWhen(d.approved_at)}
                  {d.sent_via ? ` · ${SENT_VIA_LABEL[d.sent_via] ?? d.sent_via}` : " · not sent from the console yet"}
                </span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words">{d.body}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

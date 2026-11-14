import { Panel } from "@vabrato/ui/web";
import { MemberShell } from "@/member/components/MemberShell";
import { DeleteFlyer } from "@/member/components/FlyerTools";
import { FLYER_STATUS, kindLabel, listFlyers } from "@/member/flyers";
import { sells } from "@/member/roles";
import { requirePortalMember } from "@/member/session";
import { fmtDay } from "@/member/view";

// "My flyers" (S5b PR 6; owner answers 2026-11-14): open-house flyers and
// posts a seller sent from Ask Vabrato. Each waits for their agent, who
// approves it and attaches our listing (and the open house), or declines it
// with a note. Approved flyers print with facts from our records.

const PILL: Record<keyof typeof FLYER_STATUS, string> = {
  pending: "border-gold bg-gold-50 text-gold-ink",
  approved: "border-green bg-green-50 text-green",
  declined: "border-line bg-white text-ink",
};

export default async function FlyersPage() {
  const member = await requirePortalMember("/my/flyers");
  const flyers = sells(member.role) ? await listFlyers(member.supabase, member.profile.id) : [];

  return (
    <MemberShell member={member} role={member.role} current="flyers" eyebrow="Assistant" title="My flyers">
      {!sells(member.role) ? (
        <Panel title="Flyers are for sellers">
          <p className="font-body text-body text-ink">Open-house flyers and posts are for members selling a home.</p>
        </Panel>
      ) : (
        <>
          <p className="font-body text-body-sm text-ink">
            Flyers and posts you sent from{" "}
            <a href="/my/assistant?mode=flyer" className="text-navy underline">
              Ask Vabrato
            </a>
            . Your agent approves each one and adds your listing&apos;s facts, photo, the open-house time and their details. Nothing is posted for you.
          </p>
          {flyers.length ? (
            <ol className="space-y-4 [overflow-wrap:anywhere]" aria-label="Your flyers, newest first">
              {flyers.map((f) => (
                <li key={f.id} className="space-y-2 border border-line bg-white p-4 font-body text-body-sm text-ink sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`border px-2 py-0.5 text-caption font-medium ${PILL[f.status]}`}>{FLYER_STATUS[f.status]}</span>
                    <span className="text-caption text-muted">
                      {kindLabel(f.kind)} · sent {fmtDay(f.createdAt)}
                    </span>
                  </div>
                  <h2 className="font-subhead text-subhead-sm text-ink">{f.headline}</h2>
                  {f.highlights.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5">
                      {f.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {f.status === "declined" && (
                    <p className="border-l-4 border-gold bg-gold-50 px-3 py-2">
                      <span className="font-medium">Your agent&apos;s note: </span>
                      {f.declineNote || "No note. Send them a message to talk it over."}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {f.status === "approved" ? (
                      <a href={`/my/flyers/${f.id}`} aria-label={`Open the flyer: ${f.headline}`} className="inline-flex min-h-[44px] items-center justify-center bg-navy px-4 text-label font-medium uppercase tracking-label text-white hover:bg-navy-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
                        Open the flyer
                      </a>
                    ) : (
                      <DeleteFlyer id={f.id} headline={f.headline} />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Panel title="No flyers yet">
              <p className="font-body text-body text-ink">
                Ask Vabrato can write an open-house flyer and posts from your own words.{" "}
                <a href="/my/assistant?mode=flyer" className="text-navy underline">
                  Write one
                </a>
                .
              </p>
            </Panel>
          )}
        </>
      )}
    </MemberShell>
  );
}

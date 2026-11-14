import { z } from "zod";
import { Panel } from "@vabrato/ui/web";
import { MEMBER_AI_FEATURES, memberFeatureKey } from "@vabrato/lib";
import { AskVabrato, type DocOption } from "@/member/components/AskVabrato";
import { docRef, listMemberDocuments } from "@/member/documents-list";
import { MemberShell } from "@/member/components/MemberShell";
import { aiKeyConfigured } from "@/member/ai";
import { memberAiStatus } from "@/member/ai-status";
import { homeOptions } from "@/member/assistant/drafts";
import type { AskKind } from "@/member/assistant/kinds";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";

// Ask Vabrato, the member assistant (S5b; mockup 11). Each feature has its
// own switch on top of the master switch; with none on, the menu item is
// hidden and this page says so. Answers aren't kept (owner decision
// 2026-11-13); the agent never sees the conversation. Drafts are stored only
// when the member saves them, privately (2026-11-14).

const Usage = z.object({ requests: z.number(), requests_limit: z.number() }).partial();

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AssistantPage({ searchParams }: Props) {
  const member = await requirePortalMember("/my/assistant");
  const [{ on }, usage, sp] = await Promise.all([memberAiStatus(member.supabase), member.supabase.rpc("ai_usage_today"), searchParams]);
  // "Summarize a document" lists what the member can open; HEIC photos can't be read.
  const docs: DocOption[] = [];
  if (on.includes("ai_member_summarize")) {
    const { uploads, deals } = await listMemberDocuments(member);
    for (const u of uploads) if (u.content_type !== "image/heic") docs.push({ ref: docRef.upload(u.id), label: u.name });
    for (const d of deals) for (const f of d.files) docs.push({ ref: docRef.deal(f.path), label: `${f.name} (shared for ${d.deal.address})` });
  }
  const initialDoc = typeof sp.doc === "string" ? sp.doc : undefined;
  // Switch to mode: "member_draft" is the "message" mode; cover letters are for buyers only.
  const kinds = MEMBER_AI_FEATURES.filter((f) => on.includes(f.flag))
    .map((f) => memberFeatureKey(f.flag).replace("member_", ""))
    .map((k) => (k === "draft" ? "message" : k) as AskKind)
    .filter((k) => k !== "cover_letter" || buys(member.role));
  // Drafts pick a home from the member's own sales and tracked homes (read under RLS).
  const [messageHomes, letterHomes] = await Promise.all([
    kinds.includes("message") ? homeOptions(member.supabase, member.profile.id, member.role, "message") : [],
    kinds.includes("cover_letter") ? homeOptions(member.supabase, member.profile.id, member.role, "cover_letter") : [],
  ]);
  const u = Usage.safeParse(usage.data ?? {});
  const limit = u.success ? (u.data.requests_limit ?? 0) : 0;
  const left = Math.max(0, limit - (u.success ? (u.data.requests ?? 0) : 0));

  return (
    <MemberShell member={member} role={member.role} current="assistant" eyebrow="Assistant" title="Ask Vabrato">
      {kinds.length === 0 ? (
        <Panel title="Ask Vabrato isn't available yet">
          <p className="font-body text-body text-ink">
            Ask Vabrato, our assistant, isn&apos;t switched on yet. Your agent is happy to help in the meantime:{" "}
            <a href="/my/messages" className="text-navy underline">
              send them a message
            </a>
            .
          </p>
        </Panel>
      ) : !aiKeyConfigured() ? (
        <Panel title="Ask Vabrato isn't set up yet">
          <p className="font-body text-body text-ink">
            It isn&apos;t ready on our side yet. Your agent is happy to help:{" "}
            <a href="/my/messages" className="text-navy underline">
              send them a message
            </a>
            .
          </p>
        </Panel>
      ) : (
        <>
          <section aria-labelledby="ask-about" className="border border-line bg-white p-4 font-body text-body-sm text-ink sm:p-6">
            <h2 id="ask-about" className="font-subhead text-subhead-sm text-ink">
              Your assistant
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Answers are written by AI and can be wrong. Check anything important with your agent.</li>
              <li>
                Nothing you type is kept unless you save a draft or add a to-do: leaving this page clears the rest. Your agent doesn&apos;t see your questions or drafts, only to-dos you add and messages you send them.
              </li>
              <li>It never gives legal, tax or wiring advice. Always call your escrow officer to verify wiring instructions.</li>
            </ul>
          </section>
          {limit === 0 ? (
            <p role="note" className="border border-gold bg-gold-50 p-4 font-body text-body-sm text-ink">
              Ask Vabrato isn&apos;t available on your account right now.
            </p>
          ) : (
            <AskVabrato kinds={kinds} left={left} limit={limit} docs={docs} initialDoc={initialDoc} homes={{ message: messageHomes, cover_letter: letterHomes }} />
          )}
        </>
      )}
    </MemberShell>
  );
}

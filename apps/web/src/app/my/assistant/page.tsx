import { z } from "zod";
import { Panel } from "@vabrato/ui/web";
import { MEMBER_AI_FEATURES, memberFeatureKey } from "@vabrato/lib";
import { AskVabrato } from "@/member/components/AskVabrato";
import { MemberShell } from "@/member/components/MemberShell";
import { aiKeyConfigured } from "@/member/ai";
import { memberAiStatus } from "@/member/ai-status";
import type { AskKind } from "@/member/assistant/kinds";
import { requirePortalMember } from "@/member/session";

// Ask Vabrato, the member assistant (S5b; mockup 11). Each feature has its
// own switch on top of the master switch; with none on, the menu item is
// hidden and this page says so. Answers aren't kept (owner decision
// 2026-11-13); the agent never sees the conversation.

const Usage = z.object({ requests: z.number(), requests_limit: z.number() }).partial();

export default async function AssistantPage() {
  const member = await requirePortalMember("/my/assistant");
  const [{ on }, usage] = await Promise.all([memberAiStatus(member.supabase), member.supabase.rpc("ai_usage_today")]);
  const kinds = MEMBER_AI_FEATURES.filter((f) => on.includes(f.flag)).map((f) => memberFeatureKey(f.flag).replace("member_", "") as AskKind);
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
              <li>Nothing you type here is kept: leaving this page clears it. Your agent doesn&apos;t see your questions.</li>
              <li>It never gives legal, tax or wiring advice. Always call your escrow officer to verify wiring instructions.</li>
            </ul>
          </section>
          {limit === 0 ? (
            <p role="note" className="border border-gold bg-gold-50 p-4 font-body text-body-sm text-ink">
              Ask Vabrato isn&apos;t available on your account right now.
            </p>
          ) : (
            <AskVabrato kinds={kinds} left={left} limit={limit} />
          )}
        </>
      )}
    </MemberShell>
  );
}

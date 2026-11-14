import { aiKeyConfigured } from "@/member/ai";
import { memberAiStatus } from "@/member/ai-status";
import { apiMember, json, unauthorized } from "@/member/api";
import { buys, isMemberRole } from "@/member/roles";

// Which listing modes of Ask Vabrato a signed-in member can use right now
// (S5b PR 4), for the "Ask Vabrato about this home" button on listing pages.
// Public pages stay free of AI: the button only links to /my/assistant.
export const dynamic = "force-dynamic";

export async function GET() {
  const m = await apiMember();
  if (!m) return unauthorized();
  const role = m.profile.role;
  if (!aiKeyConfigured() || !isMemberRole(role) || !buys(role) || !m.profile.onboarded_at) return json({ modes: [] });
  const { on } = await memberAiStatus(m.supabase);
  const modes = [on.includes("ai_member_listing") ? "listing" : null, on.includes("ai_member_compare") ? "compare" : null].filter(Boolean);
  return json({ modes });
}

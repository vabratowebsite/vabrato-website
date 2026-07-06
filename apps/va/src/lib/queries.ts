import type { Deal } from "@vabrato/db";
import { supabaseServer } from "@/lib/supabase-server";

export interface DealWithProgress {
  deal: Deal;
  done: number;
  total: number;
}

/** Deal plus task progress for the shared deal header; null when not found. */
export async function getDealWithProgress(id: string): Promise<DealWithProgress | null> {
  const supabase = await supabaseServer();
  const { data: deal } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal) return null;
  const { data: flags } = await supabase.from("tasks").select("done").eq("deal_id", id);
  const total = flags?.length ?? 0;
  const done = flags?.filter((t) => t.done).length ?? 0;
  return { deal, done, total };
}

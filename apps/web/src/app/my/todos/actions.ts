"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePortalMember } from "@/member/session";

// "My to-dos" (S5b PR 2, 0037). The member ticks approved to-dos, deletes
// their own, and deletes their assistant data (saved drafts, 0038, and
// waiting and declined to-dos).
// Changes go through the database functions, which check the member.

export type TodoActionResult = { ok: true; message?: string } | { ok: false; error: string };

const Id = z.string().uuid();

export async function setTodoDoneAction(id: string, done: boolean): Promise<TodoActionResult> {
  const member = await requirePortalMember("/my/todos");
  const parsed = Id.safeParse(id);
  if (!parsed.success) return { ok: false, error: "That to-do wasn't found." };
  const { error } = await member.supabase.rpc("set_my_todo_done", { p_id: parsed.data, p_done: Boolean(done) });
  if (error) return { ok: false, error: "That to-do can't be changed." };
  revalidatePath("/my/todos");
  return { ok: true };
}

export async function deleteTodoAction(id: string): Promise<TodoActionResult> {
  const member = await requirePortalMember("/my/todos");
  const parsed = Id.safeParse(id);
  if (!parsed.success) return { ok: false, error: "That to-do wasn't found." };
  const { data, error } = await member.supabase.from("member_todos").delete().eq("id", parsed.data).select("id");
  if (error || !data?.length) return { ok: false, error: "That to-do wasn't found." };
  revalidatePath("/my/todos");
  return { ok: true, message: "Deleted." };
}

export async function deleteAssistantDataAction(): Promise<TodoActionResult> {
  const member = await requirePortalMember("/my/todos");
  const { data, error } = await member.supabase.rpc("delete_my_assistant_data");
  if (error) return { ok: false, error: "We couldn't delete that. Please try again." };
  const n = Number(data ?? 0);
  revalidatePath("/my/todos");
  revalidatePath("/my/drafts");
  return { ok: true, message: n === 0 ? "There was nothing to delete." : `Deleted ${n} item${n === 1 ? "" : "s"}: your saved drafts, and to-dos that were waiting or declined.` };
}

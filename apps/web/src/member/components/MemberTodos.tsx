"use client";

import { useState, useTransition } from "react";
import { AIDraftLabel } from "@vabrato/ui/web";
import { deleteAssistantDataAction, deleteTodoAction, setTodoDoneAction, type TodoActionResult } from "@/app/my/todos/actions";

// "My to-dos" controls (S5b PR 2): tick an approved to-do, delete one, and
// delete assistant data. The page re-renders from the server after each.

const btn =
  "inline-flex min-h-[44px] items-center justify-center px-3 font-body text-body-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<TodoActionResult>) =>
    start(async () => {
      const r = await fn().catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
    });
  return { pending, msg, run };
}

export interface TodoRow {
  id: string;
  title: string;
  source: string;
  done?: boolean;
}

export function TodoDone({ todo }: { todo: TodoRow }) {
  const { pending, msg, run } = useRun();
  // Shown at once; put back if saving fails.
  const [checked, setChecked] = useState(Boolean(todo.done));
  const toggle = (v: boolean) => {
    setChecked(v);
    run(async () => {
      const r = await setTodoDoneAction(todo.id, v);
      if (!r.ok) setChecked(!v);
      return r;
    });
  };
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <label className="flex min-h-[44px] flex-1 items-start gap-3 py-1">
        <input type="checkbox" checked={checked} disabled={pending} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-navy" />
        <span className={checked ? "text-muted line-through" : "text-ink"}>
          {todo.title}
          {todo.source && <span className="block text-caption text-muted no-underline">{todo.source}</span>}
        </span>
      </label>
      <div className="flex items-center gap-2">
        <AIDraftLabel variant="suggested" />
        <TodoDelete todo={todo} />
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className="w-full text-caption text-red">
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function TodoDelete({ todo }: { todo: TodoRow }) {
  const { pending, msg, run } = useRun();
  return (
    <>
      <button type="button" disabled={pending} onClick={() => window.confirm(`Delete "${todo.title}"?`) && run(() => deleteTodoAction(todo.id))} className={`${btn} text-red underline`}>
        Delete<span className="sr-only"> {todo.title}</span>
      </button>
      {msg && !msg.ok && (
        <span role="alert" className="text-caption text-red">
          {msg.text}
        </span>
      )}
    </>
  );
}

export function DeleteAssistantData({ count }: { count: number }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending || count === 0}
        onClick={() => window.confirm("Delete your assistant data? Your saved drafts, to-dos waiting for your agent and ones your agent declined are removed. Approved to-dos stay.") && run(deleteAssistantDataAction)}
        className={`${btn} border border-red px-4 text-red hover:bg-red/5`}
      >
        Delete my assistant data
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`font-body text-body-sm ${msg.ok ? "text-green" : "font-medium text-red"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

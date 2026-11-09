"use client";

import { useId, useState, type ReactNode } from "react";
import { cx, focusLight } from "../cx";

export interface TodoItemProps {
  label: string;
  due?: string;
  done?: boolean;
  onToggle?: (done: boolean) => void;
  /** Right-side slot, e.g. <AIDraftLabel variant="suggested" />. */
  tag?: ReactNode;
}

/** Checkbox to-do row (mockups 06, 11). */
export function TodoItem({ label, due, done = false, onToggle, tag }: TodoItemProps) {
  const [checked, setChecked] = useState(done);
  const id = useId();
  return (
    <li className="flex min-h-[44px] items-center gap-3 border-b border-line py-2 last:border-b-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          onToggle?.(e.target.checked);
        }}
        className={cx("h-[18px] w-[18px] flex-none accent-navy", focusLight)}
      />
      <label
        htmlFor={id}
        className={cx(
          "flex-1 font-body text-body-sm",
          checked ? "text-muted line-through" : "text-ink",
        )}
      >
        {label}
      </label>
      {tag}
      {due && <span className="font-body text-caption text-muted">{due}</span>}
    </li>
  );
}

/** List wrapper for TodoItem rows. */
export function TodoList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="list-none">
      {children}
    </ul>
  );
}

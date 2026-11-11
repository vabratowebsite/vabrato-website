"use client";

import { useMemo, useState } from "react";
import { fmtLong } from "@vabrato/lib";
import { OwnerChip, Panel, cx, focusLight } from "@vabrato/ui/web";
import { mutedCls } from "@/components/ui";
import { buildMonthGrid, monthOf, shiftMonth } from "@/lib/calendar";

interface CalendarTask {
  id: string;
  title: string;
  owner: string;
  due_date: string;
  done: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({ tasks, ratification }: { tasks: CalendarTask[]; ratification: string }) {
  const [cursor, setCursor] = useState(() => monthOf(ratification));
  const [selected, setSelected] = useState(ratification);

  const grid = buildMonthGrid(cursor.year, cursor.month0);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const t of tasks) map.set(t.due_date, [...(map.get(t.due_date) ?? []), t]);
    return map;
  }, [tasks]);

  const selectedTasks = byDay.get(selected) ?? [];
  const shift = (delta: number) => setCursor(({ year, month0 }) => shiftMonth(year, month0, delta));
  const navBtn = cx("flex h-11 w-11 items-center justify-center border border-line bg-white font-body text-body text-navy hover:border-navy", focusLight);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel
        title={grid.label}
        className="lg:col-span-2"
        action={
          <span className="flex gap-2">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className={navBtn}>
              ‹
            </button>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className={navBtn}>
              ›
            </button>
          </span>
        }
      >
        <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-1 text-center font-body text-label uppercase tracking-label text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.cells.map((day, i) => {
            if (!day) return <div key={`pad-${i}`} />;
            const items = byDay.get(day) ?? [];
            const isSelected = day === selected;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                aria-pressed={isSelected}
                aria-label={`${fmtLong(day)}: ${items.length ? `${items.length} task${items.length === 1 ? "" : "s"}` : "no tasks"}`}
                className={cx(
                  "flex min-h-16 flex-col border p-1.5 text-left",
                  isSelected ? "border-navy bg-navy-50" : items.length ? "border-line bg-soft" : "border-line bg-white",
                  focusLight,
                )}
              >
                <span className="font-body text-caption text-ink">{Number(day.slice(-2))}</span>
                <span className="mt-1 space-y-0.5">
                  {items.slice(0, 2).map((t) => (
                    <span key={t.id} className={cx("block truncate font-body text-[10px] leading-tight text-ink", t.done && "line-through")}>
                      {t.title}
                    </span>
                  ))}
                  {items.length > 2 && <span className="block font-body text-[10px] text-ink">+{items.length - 2} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title={fmtLong(selected)}>
        <div aria-live="polite">
          {selectedTasks.length === 0 ? (
            <p className={mutedCls}>Nothing scheduled. Pick a shaded day to see its tasks.</p>
          ) : (
            <ul className="space-y-3">
              {selectedTasks.map((t) => (
                <li key={t.id} className="space-y-1">
                  <p className={cx("font-body text-body-sm", t.done ? "text-muted line-through" : "text-ink")}>
                    {t.done && <span className="sr-only">Done: </span>}
                    {t.title}
                  </p>
                  <OwnerChip owner={t.owner} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}

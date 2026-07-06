"use client";

import { useMemo, useState } from "react";
import { fmtLong } from "@vabrato/lib";
import { OwnerChip, T, ownerColor } from "@vabrato/ui";
import { buildMonthGrid, monthOf, shiftMonth } from "@/lib/calendar";

interface CalendarTask {
  id: string;
  title: string;
  owner: string;
  due_date: string;
  done: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({
  tasks,
  ratification,
}: {
  tasks: CalendarTask[];
  ratification: string;
}) {
  const [cursor, setCursor] = useState(() => monthOf(ratification));
  const [selected, setSelected] = useState(ratification);

  const grid = buildMonthGrid(cursor.year, cursor.month0);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const t of tasks) {
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    }
    return map;
  }, [tasks]);

  const selectedTasks = byDay.get(selected) ?? [];
  const shift = (delta: number) =>
    setCursor(({ year, month0 }) => shiftMonth(year, month0, delta));

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section
        className="rounded-2xl p-5 lg:col-span-2"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-base">{grid.label}</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="rounded-lg px-2.5 py-1 text-sm"
              style={{ border: `1px solid ${T.line}` }}
            >
              ‹
            </button>
            <button
              onClick={() => shift(1)}
              aria-label="Next month"
              className="rounded-lg px-2.5 py-1 text-sm"
              style={{ border: `1px solid ${T.line}` }}
            >
              ›
            </button>
          </div>
        </div>

        <div
          className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider"
          style={{ color: T.faint }}
        >
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
                onClick={() => setSelected(day)}
                className="flex min-h-16 flex-col rounded-lg p-1.5 text-left"
                style={{
                  background: isSelected ? `${T.gold}22` : items.length ? T.canvas : T.surface,
                  border: `1px solid ${isSelected ? T.gold : T.lineSoft}`,
                }}
              >
                <span className="text-xs" style={{ color: T.muted }}>
                  {Number(day.slice(-2))}
                </span>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 2).map((t) => (
                    <div
                      key={t.id}
                      className="truncate rounded px-1 py-0.5 text-[9px] leading-tight"
                      style={{
                        background: `${ownerColor(t.owner)}22`,
                        color: ownerColor(t.owner),
                        textDecoration: t.done ? "line-through" : "none",
                      }}
                    >
                      {t.title}
                    </div>
                  ))}
                  {items.length > 2 && (
                    <div className="text-[9px]" style={{ color: T.faint }}>
                      +{items.length - 2} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="rounded-2xl p-5"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        <h3 className="mb-4 font-serif text-base">{fmtLong(selected)}</h3>
        {selectedTasks.length === 0 ? (
          <p className="text-sm" style={{ color: T.faint }}>
            Nothing scheduled. Pick a highlighted day to see its tasks.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedTasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: ownerColor(t.owner) }}
                />
                <div className="min-w-0">
                  <div
                    className="text-sm"
                    style={{
                      color: t.done ? T.faint : T.text,
                      textDecoration: t.done ? "line-through" : "none",
                    }}
                  >
                    {t.title}
                  </div>
                  <OwnerChip owner={t.owner} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

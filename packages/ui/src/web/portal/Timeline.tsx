import { cx } from "../cx";

export type TimelineState = "done" | "next" | "upcoming";

export interface TimelineItem {
  title: string;
  /** Preformatted date, e.g. "Oct 31". Dates come from the schedule engine. */
  date: string;
  detail?: string;
  state: TimelineState;
}

const stateText: Record<TimelineState, string> = {
  done: "Done",
  next: "Next",
  upcoming: "Upcoming",
};

/** Milestone timeline with done / next / upcoming states (mockup 06). */
export function Timeline({
  items,
  label = "Sale timeline",
}: {
  items: TimelineItem[];
  label?: string;
}) {
  return (
    <ol aria-label={label} className="relative">
      {items.map((it, i) => (
        <li
          key={`${it.title}-${i}`}
          aria-current={it.state === "next" ? "step" : undefined}
          className="relative flex gap-4 pb-5 last:pb-0"
        >
          {i < items.length - 1 && (
            <span aria-hidden="true" className="absolute left-[9px] top-5 h-full w-px bg-line" />
          )}
          <span
            aria-hidden="true"
            className={cx(
              "relative mt-0.5 h-[18px] w-[18px] flex-none rounded-full border-2",
              it.state === "done" && "border-navy bg-navy",
              it.state === "next" && "border-gold bg-gold ring-4 ring-gold-50",
              it.state === "upcoming" && "border-muted bg-white",
            )}
          />
          <div className="flex flex-1 flex-wrap justify-between gap-x-4">
            <div>
              <p
                className={cx(
                  "font-body text-body-sm text-ink",
                  it.state === "next" && "font-bold",
                )}
              >
                <span className="sr-only">{stateText[it.state]}: </span>
                {it.title}
              </p>
              {it.detail && <p className="font-body text-caption text-muted">{it.detail}</p>}
            </div>
            <p
              className={cx(
                "font-body text-caption",
                it.state === "next" ? "font-bold text-gold-ink" : "text-muted",
              )}
            >
              {it.date}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

import { cx } from "../cx";

export const LADDER_STEPS = ["Watching", "Toured", "Offer made", "In escrow", "Purchased"] as const;
export type LadderStep = (typeof LADDER_STEPS)[number];

/** Buyer status ladder, Watching → Purchased (mockup 05). Steps before the current one read as done. */
export function StatusLadder({
  current,
  label = "Status",
}: {
  current: LadderStep;
  label?: string;
}) {
  const at = LADDER_STEPS.indexOf(current);
  return (
    <ol aria-label={label} className="flex flex-wrap gap-1">
      {LADDER_STEPS.map((s, i) => {
        const state = i < at ? "done" : i === at ? "current" : "todo";
        return (
          <li
            key={s}
            aria-current={state === "current" ? "step" : undefined}
            className={cx(
              "border px-2.5 py-1 font-body text-[10px] font-medium uppercase tracking-label",
              state === "done" && "border-navy-50 bg-navy-50 text-navy",
              state === "current" && "border-navy bg-navy text-gold",
              state === "todo" && "border-line bg-white text-muted",
            )}
          >
            {s}
            {state === "done" && <span className="sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}

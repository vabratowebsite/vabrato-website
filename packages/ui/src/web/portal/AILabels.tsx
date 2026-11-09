import { cx } from "../cx";
import { SparkleIcon } from "../icons";

// Visual labels required by SPEC <ai_rules> ("Label all AI output").
// Presentation only: these components make no model calls.

export type AIDraftVariant = "draft" | "you-send" | "suggested";

const draftText: Record<AIDraftVariant, string> = {
  draft: "AI draft",
  "you-send": "AI draft · You send it",
  suggested: "Suggested",
};

/** Label on AI-written drafts and assistant suggestions (mockup 11). */
export function AIDraftLabel({
  variant = "draft",
  className,
}: {
  variant?: AIDraftVariant;
  className?: string;
}) {
  return (
    <span
      data-ai-label={variant}
      className={cx(
        "inline-flex items-center gap-1 bg-gold-50 px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-label text-gold-ink",
        className,
      )}
    >
      {variant === "suggested" && <SparkleIcon size={10} />}
      {draftText[variant]}
    </span>
  );
}

/** Badge on AI concept images: planning only, never a listing photo (SPEC <ai_rules>). */
export function AIConceptBadge({ label, className }: { label?: string; className?: string }) {
  return (
    <span
      data-ai-label="concept"
      className={cx(
        "inline-flex items-center gap-1 bg-white px-2 py-0.5 font-body text-[11px] text-ink shadow-card",
        className,
      )}
    >
      <SparkleIcon size={10} className="text-gold-ink" />
      <span>AI concept{label ? ` · ${label}` : ""}</span>
    </span>
  );
}

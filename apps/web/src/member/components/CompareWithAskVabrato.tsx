"use client";

import { useRef, useState, useTransition } from "react";
import { SparkleIcon } from "@vabrato/ui/web";
import { askCompareAction } from "@/app/my/assistant/actions";
import type { AskCard } from "../assistant/kinds";
import { CompareAnswer } from "./ListingAnswers";

// "Compare with Ask Vabrato" under the compare table (S5b PR 4). Only shown
// while the feature is on; nothing is sent until the member presses the
// button, and the answer isn't saved.

export function CompareWithAskVabrato({ keys }: { keys: string[] }) {
  const [card, setCard] = useState<AskCard | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);

  const run = () =>
    start(async () => {
      const c = await askCompareAction(keys).catch((): AskCard => ({ kind: "error", feature: "compare", question: "Compare homes", message: "Something went wrong. Please try again." }));
      setCard(c);
      setTimeout(() => heading.current?.focus(), 0);
    });

  const title = (text: string) => (
    <h2 ref={heading} tabIndex={-1} className="font-subhead text-subhead-sm text-ink outline-none">
      {text}
    </h2>
  );

  return (
    <section aria-label="Compare with Ask Vabrato" className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 font-body">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 bg-navy px-6 text-label font-medium uppercase tracking-label text-white hover:bg-navy-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60"
        >
          <SparkleIcon size={14} />
          Compare with Ask Vabrato
        </button>
        <p className="text-caption text-muted">Uses only these homes&apos; listing facts. Nothing is saved.</p>
        {pending && (
          <p role="status" className="text-body-sm text-ink">
            Comparing…
          </p>
        )}
      </div>
      {card?.kind === "compare" && <CompareAnswer card={card} heading={title(`Comparing ${card.homes.length + card.excluded.length} homes`)} />}
      {card?.kind === "error" && (
        <div className="space-y-2 border border-gold bg-gold-50 p-4 font-body text-body-sm text-ink">
          {title("No comparison")}
          <p>{card.message}</p>
        </div>
      )}
    </section>
  );
}

"use client";

import { useId, useState } from "react";
import { cx, focusLight } from "../cx";
import { MinusIcon, PlusIcon } from "../icons";

export interface FaqItem {
  question: string;
  /** Plain text answer (also used verbatim in JSON-LD). */
  answer: string;
}

/** schema.org FAQPage object for the given items. */
export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

/** JSON for a <script> tag; escapes "<" so content can't close the script element. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface FAQAccordionProps {
  items: FaqItem[];
  /** Emit FAQPage JSON-LD (default true). Turn off if the page already emits it. */
  jsonLd?: boolean;
  headingLevel?: "h3" | "h4";
  /** Index open initially. */
  defaultOpen?: number | null;
}

/** Disclosure-pattern FAQ list that also emits FAQPage structured data. */
export function FAQAccordion({
  items,
  jsonLd = true,
  headingLevel: H = "h3",
  defaultOpen = null,
}: FAQAccordionProps) {
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(defaultOpen === null ? [] : [defaultOpen]),
  );
  const id = useId();
  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd(items)) }}
        />
      )}
      <ul className="divide-y divide-line border-y border-line">
        {items.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <li key={item.question}>
              <H>
                <button
                  type="button"
                  id={`${id}-q${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`${id}-a${i}`}
                  onClick={() => toggle(i)}
                  className={cx(
                    "flex w-full items-center justify-between gap-4 py-4 text-left font-subhead text-body text-ink hover:text-navy",
                    focusLight,
                  )}
                >
                  <span>{item.question}</span>
                  <span aria-hidden="true" className="text-gold-ink">
                    {isOpen ? <MinusIcon size={16} /> : <PlusIcon size={16} />}
                  </span>
                </button>
              </H>
              <div
                id={`${id}-a${i}`}
                role="region"
                aria-labelledby={`${id}-q${i}`}
                hidden={!isOpen}
                className="pb-4 font-body text-body-sm text-muted"
              >
                {item.answer}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

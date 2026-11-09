import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FAQAccordion, faqJsonLd, serializeJsonLd, type FaqItem } from "./FAQAccordion";

const items: FaqItem[] = [
  {
    question: "How long does it take to sell a home in San Carlos right now?",
    answer: "Sample answer one.",
  },
  { question: "Should I renovate before I sell?", answer: "Sample answer two." },
];

function jsonLdFrom(container: HTMLElement) {
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  return JSON.parse(script!.textContent ?? "");
}

describe("faqJsonLd", () => {
  it("builds a schema.org FAQPage", () => {
    expect(faqJsonLd(items)).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: items[0]!.question,
          acceptedAnswer: { "@type": "Answer", text: "Sample answer one." },
        },
        {
          "@type": "Question",
          name: items[1]!.question,
          acceptedAnswer: { "@type": "Answer", text: "Sample answer two." },
        },
      ],
    });
  });

  it("escapes < so content cannot close the script tag", () => {
    const s = serializeJsonLd(faqJsonLd([{ question: "</script><b>x", answer: "a" }]));
    expect(s).not.toContain("</script>");
    expect(JSON.parse(s).mainEntity[0].name).toBe("</script><b>x");
  });
});

describe("FAQAccordion", () => {
  it("emits FAQPage JSON-LD matching the visible questions", () => {
    const { container } = render(<FAQAccordion items={items} />);
    const data = jsonLdFrom(container);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(2);
    expect(data.mainEntity.map((q: { name: string }) => q.name)).toEqual(
      items.map((i) => i.question),
    );
  });

  it("can skip JSON-LD when the page already emits it", () => {
    const { container } = render(<FAQAccordion items={items} jsonLd={false} />);
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it("expands and collapses answers with aria-expanded", async () => {
    render(<FAQAccordion items={items} />);
    const btn = screen.getByRole("button", { name: items[0]!.question });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Sample answer one.")).not.toBeVisible();
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Sample answer one.")).toBeVisible();
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles with the keyboard", async () => {
    render(<FAQAccordion items={items} />);
    const btn = screen.getByRole("button", { name: items[1]!.question });
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});

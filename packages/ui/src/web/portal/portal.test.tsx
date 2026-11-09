import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AIConceptBadge, AIDraftLabel } from "./AILabels";
import { StatusLadder } from "./StatusLadder";
import { Timeline } from "./Timeline";
import { WiringBanner } from "./WiringBanner";

describe("StatusLadder", () => {
  it("marks the current step and earlier steps as done", () => {
    render(<StatusLadder current="Offer made" />);
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((s) => s.textContent)).toEqual([
      "Watching (done)",
      "Toured (done)",
      "Offer made",
      "In escrow",
      "Purchased",
    ]);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
  });
});

describe("Timeline", () => {
  it("gives each state a text equivalent and marks the next step", () => {
    render(
      <Timeline
        items={[
          { title: "Contract ratified", date: "Oct 14", state: "done" },
          { title: "Appraisal contingency removal", date: "Oct 31", state: "next" },
          { title: "Close of escrow", date: "Nov 10", state: "upcoming" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Done: Contract ratified");
    expect(items[1]).toHaveTextContent("Next: Appraisal contingency removal");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[2]).toHaveTextContent("Upcoming: Close of escrow");
  });
});

describe("WiringBanner", () => {
  it("tells members to call escrow to verify wiring", () => {
    render(<WiringBanner salePrice="$2,850,000" />);
    expect(screen.getByRole("note", { name: "Wiring safety" })).toHaveTextContent(
      /call your escrow officer/i,
    );
  });
});

describe("AI labels", () => {
  it("label AI drafts and concepts", () => {
    render(
      <>
        <AIDraftLabel />
        <AIDraftLabel variant="you-send" />
        <AIConceptBadge label="Light & warm" />
      </>,
    );
    expect(screen.getByText("AI draft")).toBeInTheDocument();
    expect(screen.getByText("AI draft · You send it")).toBeInTheDocument();
    expect(screen.getByText("AI concept · Light & warm")).toBeInTheDocument();
  });
});

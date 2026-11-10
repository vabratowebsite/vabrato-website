import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BADGE_LABELS, ListingCard, type ListingBadge, type ListingCardProps } from "./ListingCard";

const base: ListingCardProps = {
  address: "210 Laurel St 4A",
  cityLine: "Palo Alto, CA 94301",
  price: "$3,850,000",
  typeLine: "Condo · 3 bd · 3 ba",
  listingNo: "ML00000XXX",
  href: "/listing/sample-1",
};

describe("ListingCard", () => {
  it("renders address, price, type line, listing number and the placeholder photo", () => {
    render(<ListingCard {...base} />);
    expect(screen.getByRole("link", { name: "210 Laurel St 4A" })).toHaveAttribute(
      "href",
      "/listing/sample-1",
    );
    expect(screen.getByText("$3,850,000")).toBeInTheDocument();
    expect(screen.getByText("Condo · 3 bd · 3 ba")).toBeInTheDocument();
    expect(screen.getByText("ML00000XXX")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /listing photo \(from mls feed\)/i }),
    ).toBeInTheDocument();
  });

  const all: ListingBadge[] = ["new", "contingent", "sold", "list-sold", "price-drop", "open"];

  it.each(all)("renders the %s badge", (badge) => {
    render(<ListingCard {...base} badges={[badge]} />);
    const status = screen.getByRole("list", { name: "Status" });
    const item = within(status).getByText(BADGE_LABELS[badge]);
    expect(item).toHaveAttribute("data-badge", badge);
  });

  it("uses the expected labels", () => {
    expect(BADGE_LABELS).toEqual({
      ours: "Vabrato",
      new: "New",
      contingent: "Contingent",
      sold: "Sold",
      "list-sold": "List: Sold",
      "price-drop": "Price ↓",
      open: "Open",
    });
  });

  it("renders several badges in order and supports text overrides", () => {
    render(<ListingCard {...base} badges={["new", "open"]} badgeText={{ open: "Open Sat" }} />);
    const items = within(screen.getByRole("list", { name: "Status" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["New", "Open Sat"]);
  });

  it("omits the status list when there are no badges", () => {
    render(<ListingCard {...base} />);
    expect(screen.queryByRole("list", { name: "Status" })).not.toBeInTheDocument();
  });

  it("shows the IDX icon and listing broker for other brokers' listings (MLS-2)", () => {
    const { container } = render(
      <ListingCard {...base} attribution={{ idx: true, listingBroker: "Sample Brokerage Inc." }} />,
    );
    const slot = container.querySelector('[data-slot="idx-attribution"]');
    expect(slot).not.toBeNull();
    expect(
      within(slot as HTMLElement).getByRole("img", { name: "IDX listing" }),
    ).toBeInTheDocument();
    expect(slot).toHaveTextContent("Listing courtesy of Sample Brokerage Inc.");
  });

  it("accepts official IDX artwork through the idxIcon slot", () => {
    render(
      <ListingCard
        {...base}
        attribution={{ idx: true, listingBroker: "Sample Brokerage Inc." }}
        idxIcon={<span role="img" aria-label="MLSListings IDX" />}
      />,
    );
    expect(screen.getByRole("img", { name: "MLSListings IDX" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "IDX listing" })).not.toBeInTheDocument();
  });

  it("hides IDX attribution for Vabrato's own listings", () => {
    const { container, rerender } = render(<ListingCard {...base} />);
    expect(container.querySelector('[data-slot="idx-attribution"]')).toBeNull();
    rerender(<ListingCard {...base} attribution={{ idx: false }} />);
    expect(container.querySelector('[data-slot="idx-attribution"]')).toBeNull();
  });

  it("toggles the save heart with aria-pressed and reports changes", async () => {
    const onToggleSave = vi.fn();
    render(<ListingCard {...base} saved={false} onToggleSave={onToggleSave} />);
    const heart = screen.getByRole("button", { name: "Save 210 Laurel St 4A" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "true");
    expect(onToggleSave).toHaveBeenCalledWith(true);
  });

  it("hides the heart when saving is not offered", () => {
    render(<ListingCard {...base} />);
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });
});

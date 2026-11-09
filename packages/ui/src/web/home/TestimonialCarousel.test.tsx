import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestimonialCarousel, type Testimonial } from "./TestimonialCarousel";

const items: Testimonial[] = [
  { quote: "First sample quote.", author: "Sample Client A · Seller" },
  { quote: "Second sample quote.", author: "Sample Client B · Buyer" },
  { quote: "Third sample quote.", author: "Sample Client C · Seller" },
];

const slide = () => screen.getByTestId("testimonial-slide");
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("TestimonialCarousel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances automatically when idle", () => {
    render(<TestimonialCarousel items={items} interval={1000} />);
    expect(slide()).toHaveTextContent("First sample quote.");
    tick(1000);
    expect(slide()).toHaveTextContent("Second sample quote.");
    tick(2000);
    expect(slide()).toHaveTextContent("First sample quote.");
  });

  it("announces slides politely only when not rotating", () => {
    render(<TestimonialCarousel items={items} interval={1000} />);
    const live = slide().parentElement!;
    expect(live).toHaveAttribute("aria-live", "off");
    fireEvent.click(screen.getByRole("button", { name: "Stop automatic slide show" }));
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("pauses while focus is inside and resumes when focus leaves", () => {
    render(
      <>
        <TestimonialCarousel items={items} interval={1000} />
        <button type="button">outside</button>
      </>,
    );
    const next = screen.getByRole("button", { name: "Next testimonial" });
    act(() => next.focus());
    tick(5000);
    expect(slide()).toHaveTextContent("First sample quote.");

    act(() => screen.getByRole("button", { name: "outside" }).focus());
    tick(1000);
    expect(slide()).toHaveTextContent("Second sample quote.");
  });

  it("stays paused when focus moves between its own controls", () => {
    render(<TestimonialCarousel items={items} interval={1000} />);
    act(() => screen.getByRole("button", { name: "Next testimonial" }).focus());
    act(() => screen.getByRole("button", { name: "Previous testimonial" }).focus());
    tick(3000);
    expect(slide()).toHaveTextContent("First sample quote.");
  });

  it("pauses on hover", () => {
    render(<TestimonialCarousel items={items} interval={1000} />);
    fireEvent.mouseEnter(screen.getByRole("region", { name: "What our clients are saying" }));
    tick(3000);
    expect(slide()).toHaveTextContent("First sample quote.");
  });

  it("the pause button stops rotation until pressed again", () => {
    render(<TestimonialCarousel items={items} interval={1000} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop automatic slide show" }));
    // Clicking moves focus in browsers; blur so only the pause state matters here.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    tick(5000);
    expect(slide()).toHaveTextContent("First sample quote.");
    fireEvent.click(screen.getByRole("button", { name: "Start automatic slide show" }));
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    tick(1000);
    expect(slide()).toHaveTextContent("Second sample quote.");
  });

  it("previous/next buttons change slides and wrap", () => {
    render(<TestimonialCarousel items={items} autoPlay={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous testimonial" }));
    expect(slide()).toHaveTextContent("Third sample quote.");
    expect(slide()).toHaveAccessibleName("3 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next testimonial" }));
    expect(slide()).toHaveTextContent("First sample quote.");
  });

  it("does not rotate when reduced motion is requested", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({ matches: q.includes("reduce"), media: q }) as MediaQueryList) as typeof window.matchMedia;
    try {
      render(<TestimonialCarousel items={items} interval={1000} />);
      tick(3000);
      expect(slide()).toHaveTextContent("First sample quote.");
    } finally {
      window.matchMedia = original;
    }
  });
});

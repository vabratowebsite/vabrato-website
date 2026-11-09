import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BeforeAfterSlider, clampPct } from "./BeforeAfterSlider";

const setup = (props: Partial<Parameters<typeof BeforeAfterSlider>[0]> = {}) => {
  const onChange = vi.fn();
  render(
    <BeforeAfterSlider
      before={<div>before</div>}
      after={<div>after</div>}
      onChange={onChange}
      {...props}
    />,
  );
  return { slider: screen.getByRole("slider"), onChange };
};

describe("BeforeAfterSlider", () => {
  it("exposes slider semantics", () => {
    const { slider } = setup();
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(slider).toHaveAttribute("aria-valuenow", "50");
    expect(slider).toHaveAccessibleName("Before and after comparison");
    expect(slider).toHaveAttribute("tabindex", "0");
  });

  it("moves with arrow keys by step", async () => {
    const { slider, onChange } = setup();
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "55");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuenow", "45");
    await userEvent.keyboard("{ArrowUp}");
    expect(slider).toHaveAttribute("aria-valuenow", "50");
    await userEvent.keyboard("{ArrowDown}");
    expect(slider).toHaveAttribute("aria-valuenow", "45");
    expect(onChange).toHaveBeenLastCalledWith(45);
  });

  it("moves by bigStep with PageUp/PageDown and jumps with Home/End", async () => {
    const { slider } = setup();
    slider.focus();
    await userEvent.keyboard("{PageUp}");
    expect(slider).toHaveAttribute("aria-valuenow", "60");
    await userEvent.keyboard("{PageDown}{PageDown}");
    expect(slider).toHaveAttribute("aria-valuenow", "40");
    await userEvent.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    await userEvent.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps at the ends", async () => {
    const { slider } = setup({ initial: 98 });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    await userEvent.keyboard("{Home}{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  it("clips the before layer to the slider position", async () => {
    const { slider } = setup();
    const layer = screen.getByTestId("before-layer");
    expect(layer.style.clipPath).toBe("inset(0 50% 0 0)");
    slider.focus();
    await userEvent.keyboard("{End}");
    expect(layer.style.clipPath).toBe("inset(0 0% 0 0)");
  });

  it("ignores unrelated keys", () => {
    const { slider } = setup();
    fireEvent.keyDown(slider, { key: "a" });
    expect(slider).toHaveAttribute("aria-valuenow", "50");
  });

  it("clampPct rounds and clamps", () => {
    expect(clampPct(-4)).toBe(0);
    expect(clampPct(104)).toBe(100);
    expect(clampPct(33.6)).toBe(34);
  });
});

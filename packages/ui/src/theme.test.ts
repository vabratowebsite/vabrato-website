import { describe, expect, it } from "vitest";
import { OWNER_COLORS, T, ownerColor } from "./theme";

describe("ownerColor", () => {
  it("returns the assigned color for known owners", () => {
    expect(ownerColor("VA")).toBe(OWNER_COLORS["VA"]);
    expect(ownerColor("Rachee/Ced")).toBe("#B06E8F");
  });

  it("falls back to muted for unknown owners", () => {
    expect(ownerColor("Somebody New")).toBe(T.muted);
  });

  it("all owner colors are hex", () => {
    for (const c of Object.values(OWNER_COLORS)) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

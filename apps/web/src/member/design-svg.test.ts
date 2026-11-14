import { describe, expect, it } from "vitest";
import { contrastRatio } from "@vabrato/ui";
import { labelColor, moodboardSvg, paletteSvg, postGraphicSvg, svgDataUrl, xmlText } from "./design-svg";

const NASTY = `<script>alert(1)</script> & "quotes" 'too' <a href="javascript:x" onload="y">`;

function safe(svg: string) {
  // Only our own tags: text the model wrote is escaped, so it can't open a tag.
  const tags = svg.match(/<[^>]*>/g) ?? [];
  expect(tags.every((t) => /^<\/?(svg|title|rect|text)[\s>/]/.test(t))).toBe(true);
  for (const t of tags) expect(t).not.toMatch(/\son\w+=|href|xlink|url\(/i);
}

describe("design SVG templates", () => {
  it("escapes every text", () => {
    expect(xmlText(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
    expect(xmlText("x\u0000\u0007y")).toBe("xy");
  });

  it("palette: swatches with readable labels; nothing the model wrote can become markup", () => {
    const s = paletteSvg(NASTY, [
      { hex: "#F5F0E6", name: NASTY, use: "walls" },
      { hex: "#151B5C", name: "Navy", use: "accent" },
      { hex: "nothex", name: "Bad", use: "trim" },
    ]);
    safe(s);
    expect(s).toContain("&lt;script&gt;");
    expect(s).toContain('fill="#F5F0E6"');
    // A bad color never reaches the file.
    expect(s).not.toContain("nothex\"");
    expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });

  it("label color: the better of ink and white, AA on the brand colors", () => {
    expect(labelColor("#FFFFFF")).toBe("#1D1D1F");
    expect(labelColor("#151B5C")).toBe("#FFFFFF");
    for (const hex of ["#F5F0E6", "#151B5C", "#8A9A5B", "#E8A90C", "#333333"]) {
      const fg = labelColor(hex);
      const other = fg === "#FFFFFF" ? "#1D1D1F" : "#FFFFFF";
      expect(contrastRatio(fg, hex)).toBeGreaterThanOrEqual(contrastRatio(other, hex));
    }
    expect(contrastRatio(labelColor("#F5F0E6"), "#F5F0E6")).toBeGreaterThanOrEqual(4.5);
  });

  it("moodboard: a tile grid, escaped", () => {
    const s = moodboardSvg("Calm", Array.from({ length: 7 }, (_, i) => ({ label: i === 0 ? NASTY : `Tile ${i}`, hex: "#C8B89A", kind: "material" as const })));
    safe(s);
    expect((s.match(/<rect /g) ?? []).length).toBe(8); // header + 7 tiles
    expect(s).toContain('height="656"'); // 3 rows
  });

  it("post graphic: brand colors, our facts, no photo", () => {
    const s = postGraphicSvg({ kind: "open_house", city: "San Carlos", when: "Sunday, Nov 22 · 1:00–4:00 PM", brokerage: "Vabrato Real Estate Services · DRE #02142060" });
    safe(s);
    expect(s).toContain("OPEN HOUSE");
    expect(s).toContain("San Carlos");
    expect(s).toContain("DRE #02142060");
    expect(s).toContain('width="1080" height="1080"');
    expect(postGraphicSvg({ kind: "just_listed", city: NASTY, when: null, brokerage: "x" })).toContain("JUST LISTED");
    safe(postGraphicSvg({ kind: "just_listed", city: NASTY, when: NASTY, brokerage: NASTY }));
  });

  it("is shown through an image data URL", () => {
    expect(svgDataUrl("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
  });
});

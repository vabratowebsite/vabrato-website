import { colors as brand, contrastRatio } from "@vabrato/ui";
import type { MoodTile, PaletteColor, PromoKind } from "./assistant/kinds";

// Our own SVG templates for Ask Vabrato's design features (S5b PR 6; owner
// answer 2026-11-14: our templates, never markup the model writes). Every
// text is escaped and every color is a checked #RRGGBB, so the files are safe
// to show (as an <img>), print and download. No images, links or scripts.

const HEX = /^#[0-9A-F]{6}$/i;
const SANS = "Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Text for SVG/XML: the five special characters escaped, control characters removed. */
export function xmlText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const color = (hex: string, fallback: string = brand.soft) => (HEX.test(hex) ? hex.toUpperCase() : fallback);

/** The label color on a swatch: ink or white, whichever reads better (WCAG contrast). */
export function labelColor(hex: string): string {
  const bg = color(hex);
  return contrastRatio(brand.ink, bg) >= contrastRatio("#FFFFFF", bg) ? brand.ink : "#FFFFFF";
}

const svg = (w: number, h: number, title: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${xmlText(title)}</title>${body}</svg>`;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Labelled swatches, side by side. */
export function paletteSvg(name: string, colors: PaletteColor[]): string {
  const w = 720;
  const h = 300;
  const sw = w / Math.max(colors.length, 1);
  const parts = colors.map((c, i) => {
    const x = Math.round(i * sw);
    const fg = labelColor(c.hex);
    return [
      `<rect x="${x}" y="40" width="${Math.ceil(sw)}" height="260" fill="${color(c.hex)}"/>`,
      `<text x="${x + 12}" y="250" font-family="${SANS}" font-size="15" font-weight="bold" fill="${fg}">${xmlText(cut(c.name, 18))}</text>`,
      `<text x="${x + 12}" y="270" font-family="${SANS}" font-size="13" fill="${fg}">${xmlText(c.hex.toUpperCase())}</text>`,
      `<text x="${x + 12}" y="288" font-family="${SANS}" font-size="12" fill="${fg}">${xmlText(c.use)}</text>`,
    ].join("");
  });
  const head = `<rect width="${w}" height="40" fill="#FFFFFF"/><text x="0" y="26" font-family="${SERIF}" font-size="20" fill="${brand.navy}">${xmlText(cut(name, 40))}</text>`;
  return svg(w, h, `Palette: ${name}. ${colors.map((c) => `${c.name} ${c.hex} (${c.use})`).join(", ")}`, head + parts.join(""));
}

/** A 3-column grid of colored tiles with labels (no images). */
export function moodboardSvg(name: string, tiles: MoodTile[]): string {
  const size = 200;
  const gap = 8;
  const cols = 3;
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const w = cols * size + (cols - 1) * gap;
  const h = 40 + rows * size + (rows - 1) * gap;
  const parts = tiles.map((t, i) => {
    const x = (i % cols) * (size + gap);
    const y = 40 + Math.floor(i / cols) * (size + gap);
    const fg = labelColor(t.hex);
    return [
      `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${color(t.hex)}"/>`,
      `<text x="${x + 12}" y="${y + size - 30}" font-family="${SANS}" font-size="15" font-weight="bold" fill="${fg}">${xmlText(cut(t.label, 20))}</text>`,
      `<text x="${x + 12}" y="${y + size - 12}" font-family="${SANS}" font-size="12" fill="${fg}">${xmlText(t.kind)}</text>`,
    ].join("");
  });
  const head = `<rect width="${w}" height="40" fill="#FFFFFF"/><text x="0" y="26" font-family="${SERIF}" font-size="20" fill="${brand.navy}">${xmlText(cut(`Moodboard: ${name}`, 50))}</text>`;
  return svg(w, h, `Moodboard: ${name}. ${tiles.map((t) => `${t.label} (${t.kind})`).join(", ")}`, head + parts.join(""));
}

export interface PostGraphic {
  kind: PromoKind;
  /** The listing's city, from our records. */
  city: string;
  /** "Sunday, Nov 22 · 1:00–4:00 PM", from our records; null for "just listed" without an open house. */
  when: string | null;
  /** The brokerage line: "Vabrato Real Estate Services · DRE #…". */
  brokerage: string;
}

/** A square post graphic in Vabrato's colors. No photo (owner answer 2026-11-14). */
export function postGraphicSvg(g: PostGraphic): string {
  const w = 1080;
  const title = g.kind === "open_house" ? "OPEN HOUSE" : "JUST LISTED";
  const body = [
    `<rect width="${w}" height="${w}" fill="${brand.navy}"/>`,
    `<rect x="60" y="60" width="${w - 120}" height="${w - 120}" fill="none" stroke="${brand.gold}" stroke-width="4"/>`,
    `<text x="540" y="200" text-anchor="middle" font-family="${SERIF}" font-size="56" letter-spacing="12" fill="#FFFFFF">VABRATO</text>`,
    `<text x="540" y="470" text-anchor="middle" font-family="${SERIF}" font-size="110" fill="${brand.gold}">${xmlText(title)}</text>`,
    `<text x="540" y="580" text-anchor="middle" font-family="${SANS}" font-size="52" fill="#FFFFFF">${xmlText(cut(g.city, 28))}</text>`,
    g.when ? `<text x="540" y="670" text-anchor="middle" font-family="${SANS}" font-size="40" fill="#FFFFFF">${xmlText(cut(g.when, 40))}</text>` : "",
    `<text x="540" y="960" text-anchor="middle" font-family="${SANS}" font-size="26" fill="#FFFFFF">${xmlText(cut(g.brokerage, 70))}</text>`,
  ].join("");
  return svg(w, w, `${title === "OPEN HOUSE" ? "Open house" : "Just listed"} in ${g.city}${g.when ? `, ${g.when}` : ""}. ${g.brokerage}`, body);
}

/** An SVG as an <img> source: shown, never run (an SVG in an img can't run scripts or load anything). */
export const svgDataUrl = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

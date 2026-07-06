// Vabrato visual language, lifted from prototypes/va/vabrato_va_dashboard.jsx.
// Ink sidebar, warm canvas, gold accents; owners get stable chip colors.

export const T = {
  ink: "#1C1A17",
  ink2: "#26231E",
  canvas: "#F4F1EA",
  surface: "#FFFFFF",
  gold: "#C6A15B",
  goldDeep: "#9F7B37",
  line: "#E7E1D3",
  lineSoft: "#EFEADE",
  text: "#211E1A",
  muted: "#726A5C",
  faint: "#9A9184",
  green: "#4F7A52",
  amber: "#BE8A2C",
  red: "#B44A3D",
} as const;

export const OWNER_COLORS: Record<string, string> = {
  VA: "#8A6FB0",
  "Lead Agent": "#3E7CA8",
  Mark: "#B44A3D",
  Viv: "#C08A2E",
  TC: "#4F7A52",
  "Local Help": "#7A756A",
  "Rachee/Ced": "#B06E8F",
  LA: "#5C8A7B",
  Seller: "#9F7B37",
};

/** Chip color for a task owner; unknown owners fall back to muted. */
export function ownerColor(owner: string): string {
  return OWNER_COLORS[owner] ?? T.muted;
}

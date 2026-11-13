// A PDF's page count, for limits and cost estimates. Pure: no PDF library,
// safe in any app or package (moved from apps/va in S5b PR 1).

/**
 * A PDF's page count from its page tree without a PDF library: the largest
 * /Count in a /Pages node, else the number of /Type /Page objects. Null when
 * neither can be read (compressed object streams); the file is then sent and
 * an API "too large" error says to split it.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  let count = 0;
  for (const m of text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)) count = Math.max(count, Number(m[1] ?? m[2]));
  if (count > 0) return count;
  const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  return pages > 0 ? pages : null;
}

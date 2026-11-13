// A small text-only PDF writer for the live test's fictional documents
// (S6b PR 9). Uncompressed, Helvetica, one page per entry of `pages`; enough
// for the model to read the text and for countPdfPages() to count the pages.

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");

export function textPdf(pages: string[][]): Buffer {
  const objs: string[] = [];
  /** Adds an object; returns its object number (1-based). */
  const add = (o: string) => objs.push(o);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES"); // object 2, filled in below
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const body = `BT /F1 11 Tf 14 TL 60 740 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

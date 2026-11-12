import { describe, expect, it } from "vitest";
import { checkDealFile, checkReceiptFile, countPdfPages, freeName, isOwnReceiptUpload, loadMissing, missingByDeal, originalName, parseDocPath, safeFileName, sniffType, staffDocPath } from "./documents";

// S6b PR 7a: file checks, storage paths and the missing count. Fictional ids.

const DEAL = "d1000000-0000-4000-8000-0000000032d1";
const ME = "c1000000-0000-4000-8000-0000000032c1";
const U = "0f8c6f2e-1111-4222-8333-944444444444";
const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

describe("file checks", () => {
  it("tell the type from the first bytes, not the name", () => {
    expect([PDF, JPG, PNG, WEBP].map(sniffType)).toEqual(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    expect(sniffType(new TextEncoder().encode("<html>hello</html>"))).toBeNull();
  });

  it("deal documents: PDF, JPG or PNG up to 20 MB", () => {
    expect(checkDealFile(1000, PDF)).toEqual({ type: "application/pdf" });
    expect(checkDealFile(1000, WEBP)).toEqual({ error: "Upload a PDF, JPG or PNG." });
    expect(checkDealFile(21 * 1024 * 1024, PDF)).toMatchObject({ error: expect.stringMatching(/20 MB/) });
    expect(checkDealFile(0, PDF)).toMatchObject({ error: expect.stringMatching(/Choose/) });
  });

  it("receipts: also WebP, up to 10 MB", () => {
    expect(checkReceiptFile(1000, WEBP)).toEqual({ type: "image/webp" });
    expect(checkReceiptFile(11 * 1024 * 1024, JPG)).toMatchObject({ error: expect.stringMatching(/10 MB/) });
    expect(checkReceiptFile(1000, new TextEncoder().encode("MZ executable"))).toMatchObject({ error: expect.any(String) });
  });

  it("file names are safe storage keys and keep the real type's extension", () => {
    expect(safeFileName("Seller Disclosures (signed).PDF", "application/pdf")).toBe("Seller Disclosures (signed).pdf");
    expect(safeFileName("../../etc/passwd", "application/pdf")).toBe("etc passwd.pdf");
    expect(safeFileName("résumé#1?.jpeg", "image/jpeg")).toBe("re sume 1.jpg");
    expect(safeFileName("....", "image/png")).toBe("document.png");
    expect(safeFileName("x".repeat(300), "application/pdf")).toHaveLength(104);
  });
});

describe("paths", () => {
  it("staff uploads sit in the deal's staff folder; shared files one level up", () => {
    const p = staffDocPath(DEAL, U, "rpa.pdf");
    expect(p).toBe(`deal/${DEAL}/staff/${U}-rpa.pdf`);
    expect(parseDocPath(p, DEAL)).toEqual({ shared: false, name: "rpa.pdf" });
    expect(parseDocPath(`deal/${DEAL}/rpa.pdf`, DEAL)).toEqual({ shared: true, name: "rpa.pdf" });
  });

  it("file_name keeps the name as uploaded, without control characters or slashes", () => {
    expect(originalName("Seller Disclosures (signed) – final.PDF", "x.pdf")).toBe("Seller Disclosures (signed) – final.PDF");
    expect(originalName("../../a\u0000b/c.pdf", "x.pdf")).toBe(".. .. a b c.pdf");
    expect(originalName("   ", "fallback.pdf")).toBe("fallback.pdf");
    expect(originalName("y".repeat(300), "x.pdf")).toHaveLength(200);
  });

  it("refuse anything outside this deal's folder", () => {
    expect(parseDocPath(`deal/d2000000-0000-4000-8000-0000000032d2/rpa.pdf`, DEAL)).toBeNull();
    expect(parseDocPath(`deal/${DEAL}/other/rpa.pdf`, DEAL)).toBeNull();
    expect(parseDocPath(`deal/${DEAL}/staff/a/b.pdf`, DEAL)).toBeNull();
    expect(parseDocPath(`deal/${DEAL}/.hidden`, DEAL)).toBeNull();
    expect(parseDocPath(`intake/${ME}/x.pdf`, DEAL)).toBeNull();
  });

  it("sharing never overwrites a file with the same name", () => {
    expect(freeName("rpa.pdf", [])).toBe("rpa.pdf");
    expect(freeName("rpa.pdf", ["rpa.pdf", "rpa (2).pdf"])).toBe("rpa (3).pdf");
  });

  it("a receipt upload must be the caller's own, on this deal", () => {
    expect(isOwnReceiptUpload(`deal/${DEAL}/uploads/${ME}/${U}.jpg`, DEAL, ME)).toBe(true);
    expect(isOwnReceiptUpload(`deal/${DEAL}/uploads/c2000000-0000-4000-8000-0000000032c2/${U}.jpg`, DEAL, ME)).toBe(false);
    expect(isOwnReceiptUpload(`deal/${DEAL}/uploads/${ME}/${U}.exe`, DEAL, ME)).toBe(false);
    expect(isOwnReceiptUpload(`deal/${DEAL}/${U}.jpg`, DEAL, ME)).toBe(false);
  });
});

describe("PDF pages", () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  it("reads the page tree's /Count, else counts /Type /Page objects", () => {
    expect(countPdfPages(enc("%PDF-1.4\n1 0 obj << /Type /Pages /Kids [3 0 R] /Count 742 >> endobj\n2 0 obj << /Type /Pages /Count 2 >> endobj"))).toBe(742);
    expect(countPdfPages(enc("%PDF-1.4\n<< /Count 12 /Type /Pages >>"))).toBe(12);
    expect(countPdfPages(enc("%PDF-1.4\n<< /Type /Page >> << /Type /Page >> << /Type /Page /Parent 1 0 R >>"))).toBe(3);
  });
  it("is unknown when the page tree is compressed", () => {
    expect(countPdfPages(enc("%PDF-1.5\n1 0 obj << /Type /ObjStm /N 40 /Filter /FlateDecode >> stream xyz endstream"))).toBeNull();
  });
});

it("missing documents are skipped quietly when the documents table isn't there yet (before 0032)", async () => {
  const table = (name: string) => ({
    select: () => ({ in: async () => (name === "deal_documents" ? { data: null, error: { code: "PGRST205", message: "not found" } } : { data: [], error: null }) }),
  });
  const supabase = { from: table } as unknown as Parameters<typeof loadMissing>[0];
  expect(await loadMissing(supabase, [{ id: "a", address: "1 Fixture Way", seller_type: "normal" }])).toEqual([]);
});

it("missing documents per deal count files, the seller's tagged uploads and not-needed marks", () => {
  const out = missingByDeal({
    deals: [
      { id: "a", address: "1 Fixture Way", seller_type: "normal" },
      { id: "b", address: "2 Fixture Way", seller_type: "probate" },
    ],
    docs: [{ deal_id: "a", doc_types: ["rpa", "tds", "spq", "avid"] }],
    memberDocs: [{ deal_id: "a", doc_types: ["nhd"] }],
    marks: [{ deal_id: "a", item_key: "lead_paint" }],
  });
  const a = out.find((d) => d.id === "a")!;
  expect(a.missing).not.toEqual(expect.arrayContaining(["Residential Purchase Agreement (RPA)", "Natural Hazard Disclosure report (NHD)", "Lead-based paint disclosure (FLD)"]));
  expect(a.missing).toContain("Agency disclosure (AD)");
  expect(out.find((d) => d.id === "b")!.missing).toContain("Letters Testamentary or Letters of Administration");
});

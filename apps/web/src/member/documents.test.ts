import { describe, expect, it } from "vitest";
import { DEAL_DOC_PATH, MEMBER_PATH, displayName, sizeLabel, sniffDocumentType, storagePath } from "./documents";

const bytes = (...parts: (number[] | string)[]) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") out.push(...[...p].map((c) => c.charCodeAt(0)));
    else out.push(...p);
  }
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

describe("sniffDocumentType (review item 8)", () => {
  it.each([
    ["PDF", bytes("%PDF-1.7\n"), "application/pdf"],
    ["PNG", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["JPEG", bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["WebP", bytes("RIFF", [1, 2, 3, 4], "WEBP"), "image/webp"],
    ["HEIC", bytes([0, 0, 0, 0x18], "ftypheic"), "image/heic"],
  ])("recognises %s by its bytes", (_label, b, type) => {
    expect(sniffDocumentType(b)).toBe(type);
  });

  it.each([
    ["SVG", bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["HTML", bytes("<!doctype html><html>")],
    ["a script renamed .pdf", bytes("#!/bin/sh\nrm -rf /")],
    ["a ZIP or Office file", bytes([0x50, 0x4b, 0x03, 0x04])],
    ["an empty file", new Uint8Array(0)],
  ])("refuses %s", (_label, b) => {
    expect(sniffDocumentType(b)).toBeNull();
  });
});

describe("file names and paths", () => {
  const id = "a2000000-0000-4000-8000-0000000004a1";
  it("keeps a readable display name without paths or control characters", () => {
    expect(displayName("C:\\Users\\me\\Inspection Report (final).pdf")).toBe("Inspection Report (final).pdf");
    expect(displayName("../../etc/passwd")).toBe("passwd");
    expect(displayName("a\u0000b\u001fc.pdf")).toBe("abc.pdf");
    expect(displayName("")).toBe("Document");
  });

  it("builds a safe storage path whose extension follows the real type", () => {
    const p = storagePath(id, "Inspection Report (final).PDF", "application/pdf", "0f8c6f2e-1111-4222-8333-944444444444");
    expect(p).toBe(`member/${id}/0f8c6f2e-1111-4222-8333-944444444444-inspection-report-final.pdf`);
    expect(MEMBER_PATH.test(p)).toBe(true);
    expect(storagePath(id, "photo.svg", "image/png", "r")).toBe(`member/${id}/r-photo.png`);
    expect(storagePath(id, "???", "image/jpeg", "r")).toBe(`member/${id}/r-document.jpg`);
  });

  it("accepts only deal document paths inside a deal folder", () => {
    expect(DEAL_DOC_PATH.test("deal/da000000-0000-4000-8000-0000000000da/disclosures.pdf")).toBe(true);
    expect(DEAL_DOC_PATH.test("deal/da000000-0000-4000-8000-0000000000da/../../x")).toBe(false);
    expect(DEAL_DOC_PATH.test("member/x/y.pdf")).toBe(false);
  });

  it("labels sizes", () => {
    expect(sizeLabel(900)).toBe("900 B");
    expect(sizeLabel(2048)).toBe("2 KB");
    expect(sizeLabel(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

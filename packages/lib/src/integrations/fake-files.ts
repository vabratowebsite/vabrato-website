// Fictional file contents for the fake Google Drive and Dropbox (tests and
// QA only, Integrations PR 2): just enough bytes for the console's type
// sniffing to see a PDF, PNG, JPEG, HEIC (refused) or an oversized file.

export type FakeKind = "pdf" | "png" | "jpg" | "heic" | "big" | "text" | "gdoc";

const enc = new TextEncoder();

export function fakeFileBytes(kind: FakeKind): Uint8Array {
  switch (kind) {
    case "pdf":
      return enc.encode("%PDF-1.4\n% Fictional document for local QA\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
    case "png":
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...enc.encode("fictional png body")]);
    case "jpg":
      return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...enc.encode("fictional jpeg body")]);
    case "heic":
      return new Uint8Array([0x00, 0x00, 0x00, 0x18, ...enc.encode("ftypheic"), ...enc.encode("fictional heic body")]);
    case "big": {
      // Over the 20 MB document limit: a PDF header and zeros.
      const b = new Uint8Array(21 * 1024 * 1024);
      b.set(enc.encode("%PDF-1.4\n"));
      return b;
    }
    default:
      return enc.encode("Just some text, not a document.");
  }
}

export const fakeMime: Record<FakeKind, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  heic: "image/heic",
  big: "application/pdf",
  text: "text/plain",
  gdoc: "application/vnd.google-apps.document",
};

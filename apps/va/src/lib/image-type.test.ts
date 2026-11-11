import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, checkPhoto, sniffImage } from "./image-type";

const bytes = (...v: (number | string)[]) => new Uint8Array(v.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("agent photo checks", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))?.mime).toBe("image/png");
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))?.mime).toBe("image/webp");
  });

  it("refuses SVG, HTML, GIF and renamed files", () => {
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(bytes("<!doctype html><img src=x onerror=alert(1)>"))).toBeNull();
    expect(sniffImage(bytes("GIF89a"))).toBeNull();
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeNull();
  });

  it("checks size", () => {
    const jpeg = bytes(0xff, 0xd8, 0xff);
    expect(checkPhoto(0, jpeg)).toEqual({ ok: false, error: "Choose a photo to upload." });
    expect(checkPhoto(MAX_PHOTO_BYTES + 1, jpeg).ok).toBe(false);
    expect(checkPhoto(MAX_PHOTO_BYTES, jpeg)).toEqual({ ok: true, type: { ext: "jpg", mime: "image/jpeg" } });
  });
});

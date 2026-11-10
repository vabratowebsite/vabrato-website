import { describe, expect, it } from "vitest";
import { resolveListingPhoto } from "./photos";

describe("listing photos", () => {
  it("falls back to the placeholder for mock or missing photos", () => {
    expect(resolveListingPhoto({ url: "https://mock.mls.invalid/media/FX-001-P1.svg" }, "https://x.supabase.co")).toBeNull();
    expect(resolveListingPhoto(null)).toBeNull();
    expect(resolveListingPhoto({ url: "not a url" })).toBeNull();
    expect(resolveListingPhoto({ url: "http://cdn.example.com/a.jpg" })).toBeNull();
  });

  it("serves MLS photos unoptimized, hotlinked or copied (review item 8)", () => {
    expect(resolveListingPhoto({ url: "https://cdn.example.com/a.jpg" })).toEqual({ src: "https://cdn.example.com/a.jpg", unoptimized: true });
    expect(resolveListingPhoto({ url: "https://cdn.example.com/a.jpg", storage_path: "listing/K 1/P1.jpg" }, "https://x.supabase.co/")).toEqual({
      src: "https://x.supabase.co/storage/v1/object/public/mls-photos/listing/K%201/P1.jpg",
      unoptimized: true,
    });
  });
});

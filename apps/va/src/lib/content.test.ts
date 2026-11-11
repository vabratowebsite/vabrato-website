import { describe, expect, it } from "vitest";
import { bodyFromLive, checkContent, parseContentForm, sitePath } from "./content";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("content editor forms", () => {
  it("reads a city guide with neighborhood, school and FAQ rows, skipping empty rows", () => {
    const r = parseContentForm(
      "city_guides",
      form({
        key: "san-carlos",
        intro: "Fictional intro.",
        hood_name_0: "Example Heights",
        hood_summary_0: "Hillside streets near the library.",
        hood_name_1: "",
        hood_summary_1: "",
        school_name_0: "Example School District",
        school_url_0: "https://example-district.test/",
        faq_q_2: "Is there a train?",
        faq_a_2: "Yes, Caltrain.",
      }),
    );
    expect(r).toEqual({
      ok: true,
      key: "san-carlos",
      body: {
        intro: "Fictional intro.",
        neighborhoods: [{ name: "Example Heights", summary: "Hillside streets near the library." }],
        school_links: [{ name: "Example School District", url: "https://example-district.test/" }],
        faq: [{ q: "Is there a train?", a: "Yes, Caltrain." }],
      },
    });
  });

  it("refuses school rating sites and half-filled rows", () => {
    const base = { key: "san-carlos", intro: "x" };
    expect(parseContentForm("city_guides", form({ ...base, school_name_0: "Ratings", school_url_0: "https://www.greatschools.org/x" }))).toMatchObject({ ok: false, error: /Rating and ranking sites/ });
    expect(parseContentForm("city_guides", form({ ...base, school_name_0: "District", school_url_0: "http://district.test" }))).toMatchObject({ ok: false });
    expect(parseContentForm("city_guides", form({ ...base, hood_name_0: "Only a name" }))).toMatchObject({ ok: false, error: /needs a name/ });
  });

  it("reads a post and checks its web address", () => {
    const ok = parseContentForm("posts", form({ key: "Market-Update", kind: "market_update", title: "Title", excerpt: "", body_md: "Body\r\nline" }));
    expect(ok).toEqual({ ok: true, key: "market-update", body: { kind: "market_update", title: "Title", excerpt: "", body_md: "Body\nline" } });
    expect(parseContentForm("posts", form({ key: "bad slug", kind: "insight", title: "T", body_md: "B" }))).toMatchObject({ ok: false });
    expect(parseContentForm("posts", form({ key: "ok", kind: "advert", title: "T", body_md: "B" }))).toMatchObject({ ok: false, error: /kind/ });
  });

  it("reads a testimonial; permission is a checkbox", () => {
    const r = parseContentForm("testimonials", form({ author_display: "Sam Q.", role: "seller", quote: "Fictional.", source: "Email", sort: "2", permission_confirmed: "on" }));
    expect(r).toEqual({ ok: true, key: null, body: { author_display: "Sam Q.", role: "seller", quote: "Fictional.", source: "Email", sort: 2, permission_confirmed: true } });
    expect(parseContentForm("testimonials", form({ key: "not-a-uuid", author_display: "A", quote: "Q" }))).toMatchObject({ ok: false });
  });

  it("prefills from live rows", () => {
    expect(bodyFromLive("posts", { kind: "news", title: "T", excerpt: null, body_md: "B" })).toEqual({ kind: "news", title: "T", excerpt: "", body_md: "B" });
    expect(bodyFromLive("city_guides", { intro: "I", neighborhoods: "oops", school_links: [], faq: [{ q: "Q", a: "A" }] })).toEqual({
      intro: "I",
      neighborhoods: [],
      school_links: [],
      faq: [{ q: "Q", a: "A" }],
    });
    expect(bodyFromLive("testimonials", null)).toBeNull();
  });

  it("runs the Fair Housing check over the whole body", () => {
    expect(checkContent({ kind: "insight", title: "Perfect for young families", excerpt: "", body_md: "Three bedrooms." }).blocking).toBe(true);
    expect(checkContent({ kind: "insight", title: "Three bedrooms near Caltrain", excerpt: "", body_md: "A yard." }).blocking).toBe(false);
  });

  it("links to where the content shows", () => {
    expect(sitePath("city_guides", "san-carlos")).toBe("/neighborhoods/san-carlos");
    expect(sitePath("posts", "x")).toBe("/insights/x");
    expect(sitePath("testimonials", null)).toBe("/testimonials");
  });
});

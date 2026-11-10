import { describe, expect, it } from "vitest";
import { officialSchoolLinks } from "./schools";

describe("school links (review item 14)", () => {
  it("keeps official https sites and drops rating sites and bad URLs", () => {
    const links = [
      { name: "District", url: "https://www.example-district.k12.ca.us/" },
      { name: "Ratings", url: "https://www.greatschools.org/california/x" },
      { name: "Rankings", url: "https://niche.com/k12/x" },
      { name: "Plain http", url: "http://district.example.org/" },
      { name: "Broken", url: "not a url" },
    ];
    expect(officialSchoolLinks(links)).toEqual([{ name: "District", url: "https://www.example-district.k12.ca.us/" }]);
  });
});

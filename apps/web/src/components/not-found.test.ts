import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotFoundBody } from "./NotFoundBody";

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? "");

describe("not-found page", () => {
  it("vabrato.com links to search and contact", () => {
    const html = renderToStaticMarkup(createElement(NotFoundBody));
    expect(html).toContain("<h1");
    expect(hrefs(html)).toEqual(["/search", "/contact"]);
  });

  it("homes.sancarloslife.com only links to pages that exist there, or to vabrato.com", () => {
    const html = renderToStaticMarkup(createElement(NotFoundBody, { site: "sancarloslife" }));
    for (const href of hrefs(html)) expect(href === "/" || href.startsWith("https://vabrato.com/")).toBe(true);
  });
});

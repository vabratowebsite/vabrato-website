import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, safeHref } from "./Markdown";

const render = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));

describe("post Markdown", () => {
  it("renders basic formatting", () => {
    const html = render("## Market update\n\nPrices **held** steady.\n\n- one\n- two");
    expect(html).toContain("<h2>Market update</h2>");
    expect(html).toContain("<strong>held</strong>");
    expect(html).toContain("<li>one</li>");
  });

  it("never renders raw HTML or unsafe links", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1)) and [ok](https://example.com) and [home](/search)');
    expect(html).not.toMatch(/<script|<img|onerror|javascript:/i);
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('href="/search"');
  });

  it("drops images and other disallowed elements", () => {
    expect(render("![x](https://example.com/a.png)")).not.toContain("<img");
  });

  it("only allows https, mailto and same-site links", () => {
    expect(safeHref("http://example.com")).toBeUndefined();
    expect(safeHref("//evil.example/x")).toBeUndefined();
    expect(safeHref("mailto:hello@example.test")).toBe("mailto:hello@example.test");
  });
});

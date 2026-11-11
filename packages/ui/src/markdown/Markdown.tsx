import ReactMarkdown from "react-markdown";

// Post bodies (Insights on the website, and the console's preview, so
// both render the same way). Raw HTML is never rendered (skipHtml) and only
// basic elements are allowed; links open safely. Content is written by staff
// in the S6 editor, but we treat it as untrusted text anyway.

const ALLOWED = ["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "a", "blockquote", "hr", "br"];

export function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "mailto:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="max-w-prose space-y-4 font-body text-body text-ink [&_a]:text-navy [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gold [&_blockquote]:pl-4 [&_h2]:font-subhead [&_h2]:text-subhead-lg [&_h3]:font-subhead [&_h3]:text-subhead-md [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
      <ReactMarkdown
        skipHtml
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          a: ({ href, children: c }) => {
            const safe = safeHref(href);
            if (!safe) return <>{c}</>;
            const external = !safe.startsWith("/");
            return (
              <a href={safe} {...(external ? { rel: "noopener noreferrer" } : {})}>
                {c}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

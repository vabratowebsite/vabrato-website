import { serializeJsonLd } from "@/lib/seo";

/** Inlines schema.org JSON-LD (escaped, see serializeJsonLd). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BreadcrumbBar } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { Markdown } from "@/components/Markdown";
import { getPost } from "@/lib/public/content";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const revalidate = 900;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: "Article not found | Vabrato" };
  return pageMetadata({ title: `${post.title} | Vabrato Insights`, description: post.excerpt, path: `/insights/${post.slug}` });
}

export default async function PostPage({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const path = `/insights/${post.slug}`;
  return (
    <>
      <BreadcrumbBar items={[{ label: "Home", href: "/" }, { label: "Insights", href: "/insights" }, { label: post.title }]} />
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-12 md:px-6">
        <header>
          <h1 className="font-display text-display-md uppercase text-navy">{post.title}</h1>
          {post.published_at && (
            <p className="mt-2 font-body text-body-sm text-muted">
              {new Date(post.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}
            </p>
          )}
        </header>
        <Markdown>{post.body_md}</Markdown>
      </article>
      <JsonLd data={articleJsonLd({ title: post.title, excerpt: post.excerpt, path, publishedAt: post.published_at })} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Insights", path: "/insights" }, { name: post.title, path }])} />
    </>
  );
}

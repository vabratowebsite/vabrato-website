import { z } from "zod";
import { publicSupabase } from "./supabase";

// Published site content (0014). RLS returns published rows only to the public.

const PostSchema = z.object({
  slug: z.string(),
  kind: z.enum(["insight", "news", "event", "market_update"]),
  title: z.string(),
  excerpt: z.string(),
  published_at: z.string().nullable(),
});
export type PostSummary = z.infer<typeof PostSchema>;

export async function latestPosts(limit = 3): Promise<PostSummary[]> {
  const { data, error } = await publicSupabase()
    .from("posts")
    .select("slug, kind, title, excerpt, published_at")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`posts query failed: ${error.message}`);
  return z.array(PostSchema).parse(data ?? []);
}

const TestimonialSchema = z.object({
  author_display: z.string(),
  role: z.string().nullable(),
  quote: z.string(),
  source: z.string().nullable(),
});

export async function publishedTestimonials(limit = 12) {
  const { data, error } = await publicSupabase().from("testimonials").select("author_display, role, quote, source").order("sort").limit(limit);
  if (error) throw new Error(`testimonials query failed: ${error.message}`);
  return z.array(TestimonialSchema).parse(data ?? []);
}

const VideoSchema = z.object({ title: z.string(), youtube_id: z.string() });

export async function publishedVideos(limit = 4) {
  const { data, error } = await publicSupabase().from("videos").select("title, youtube_id").order("sort").limit(limit);
  if (error) throw new Error(`videos query failed: ${error.message}`);
  return z.array(VideoSchema).parse(data ?? []);
}

const linkList = z.array(z.object({ name: z.string(), url: z.string().url() })).catch([]);
const faqList = z.array(z.object({ q: z.string(), a: z.string() })).catch([]);
const hoodList = z.array(z.object({ name: z.string(), summary: z.string() })).catch([]);

const GuideSchema = z.object({
  city_slug: z.string(),
  intro: z.string(),
  neighborhoods: hoodList,
  school_links: linkList,
  faq: faqList,
});
export type CityGuide = z.infer<typeof GuideSchema>;

export async function cityGuide(slug: string): Promise<CityGuide | null> {
  const { data, error } = await publicSupabase()
    .from("city_guides")
    .select("city_slug, intro, neighborhoods, school_links, faq")
    .eq("city_slug", slug)
    .maybeSingle();
  if (error) throw new Error(`city guide query failed: ${error.message}`);
  return data ? GuideSchema.parse(data) : null;
}

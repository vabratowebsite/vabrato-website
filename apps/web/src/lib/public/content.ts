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

// Agent profiles (SPEC <agent_roster>; mockups 09/10). Business contact only.
const skillList = z.array(z.object({ title: z.string(), detail: z.string().optional() })).catch([]);
const socialList = z
  .array(z.object({ network: z.enum(["facebook", "instagram", "youtube", "linkedin"]), href: z.string().url() }))
  .catch([]);

export const AgentSchema = z.object({
  slug: z.string(),
  display_name: z.string(),
  title: z.string(),
  bio: z.string(),
  photo_path: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  license_number: z.string().nullable(),
  mls_member_id: z.string().nullable(),
  start_year: z.number().nullable(),
  social_links: socialList,
  outlook: z.string(),
  skills: skillList,
  history: z.string(),
  video_youtube_id: z.string().nullable(),
  faq: faqList,
});
export type Agent = z.infer<typeof AgentSchema>;

const AGENT_COLUMNS =
  "slug, display_name, title, bio, photo_path, phone, email, license_number, mls_member_id, start_year, social_links, outlook, skills, history, video_youtube_id, faq";

export async function listAgents(): Promise<Agent[]> {
  const { data, error } = await publicSupabase().from("agent_profiles").select(AGENT_COLUMNS).order("sort");
  if (error) throw new Error(`agent profiles query failed: ${error.message}`);
  return z.array(AgentSchema).parse(data ?? []);
}

export async function getAgent(slug: string): Promise<Agent | null> {
  const { data, error } = await publicSupabase().from("agent_profiles").select(AGENT_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`agent profile query failed: ${error.message}`);
  return data ? AgentSchema.parse(data) : null;
}

export async function listPosts(limit = 50): Promise<PostSummary[]> {
  return latestPosts(limit);
}

const PostFullSchema = PostSchema.extend({ body_md: z.string() });
export type Post = z.infer<typeof PostFullSchema>;

export async function getPost(slug: string): Promise<Post | null> {
  const { data, error } = await publicSupabase()
    .from("posts")
    .select("slug, kind, title, excerpt, body_md, published_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`post query failed: ${error.message}`);
  return data ? PostFullSchema.parse(data) : null;
}

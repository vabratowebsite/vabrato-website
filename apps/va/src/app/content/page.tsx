import Link from "next/link";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { btnPrimary, btnSecondary, linkAction, mutedCls } from "@/components/ui";
import { STATUS_LABEL, TABLE_LABEL, asBody, revisionLabel } from "@/lib/content";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Website content (S6 PR 4): city guides, Insights posts and testimonials.
// Staff write drafts and send them for approval; Mark (or Viv while Mark is
// away) publishes. Agent profiles and featured listings have their own pages
// and need no approval.
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const [{ data: revisions }, { data: acting }, { data: cities }, { data: guides }, { data: posts }, { data: quotes }] = await Promise.all([
    supabase.from("content_revisions").select("id, table_name, row_key, body, status, created_by, submitted_at, updated_at, review_note").order("updated_at", { ascending: false }).limit(200),
    supabase.rpc("is_acting_lead_admin"),
    supabase.from("cities").select("slug, name").order("name"),
    supabase.from("city_guides").select("city_slug, published, is_placeholder, approved_at"),
    supabase.from("posts").select("slug, title, kind, published, is_placeholder, published_at").order("published_at", { ascending: false, nullsFirst: false }),
    supabase.from("testimonials").select("id, author_display, published, is_placeholder, permission_confirmed, sort").order("sort"),
  ]);
  const cityName = (slug: string) => (cities ?? []).find((c) => c.slug === slug)?.name;
  const all = revisions ?? [];
  const waiting = all.filter((r) => r.status === "submitted");
  const open = all.filter((r) => (r.status === "draft" || r.status === "rejected") && (r.created_by === profile.id || acting));
  const published = all.filter((r) => r.status === "published").slice(0, 10);
  const label = (r: (typeof all)[number]) => revisionLabel(r.table_name, r.row_key, asBody(r.body), cityName);

  const revisionList = (list: typeof all, empty: string, showNote = false) =>
    list.length ? (
      <ul className="divide-y divide-line">
        {list.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <Link href={`/content/${r.id}`} className="font-body text-body-sm font-medium text-navy underline">
                {label(r)}
              </Link>
              <p className="font-body text-caption text-muted">
                {TABLE_LABEL[r.table_name].one} · {STATUS_LABEL[r.status]} · {fmtWhen(r.submitted_at ?? r.updated_at)}
              </p>
              {showNote && r.review_note && <p className="mt-1 font-body text-caption text-ink">Note: {r.review_note}</p>}
            </div>
            {r.status === "rejected" && <Pill tone="gold">Sent back</Pill>}
          </li>
        ))}
      </ul>
    ) : (
      <p className={mutedCls}>{empty}</p>
    );

  const guideBySlug = new Map((guides ?? []).map((g) => [g.city_slug, g]));

  return (
    <ConsoleShell
      profile={profile}
      current="content"
      eyebrow="Website"
      title="Content"
      topRight={
        <div className="flex flex-wrap gap-2">
          <Link href="/content/edit?table=posts" className={btnPrimary}>
            New post
          </Link>
          <Link href="/content/edit?table=testimonials" className={btnSecondary}>
            New testimonial
          </Link>
        </div>
      }
    >
      <p className={mutedCls}>
        Changes go live only when {acting ? "you approve them" : "Mark (or Viv while Mark is away) approves them"}. Editing never takes a page down: the website keeps showing the published version until the new one is approved.
      </p>

      <Panel title={`Waiting for approval (${waiting.length})`}>{revisionList(waiting, acting ? "Nothing to review." : "Nothing waiting.")}</Panel>
      <Panel title={acting ? "Drafts and sent back (everyone)" : "Your drafts and sent back"}>{revisionList(open, "No drafts.", true)}</Panel>

      <Panel title="City guides">
        <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {(cities ?? []).map((c) => {
            const g = guideBySlug.get(c.slug);
            return (
              <li key={c.slug} className="flex items-center justify-between gap-2 border-b border-line py-1">
                <span className="font-body text-body-sm text-ink">
                  {c.name}{" "}
                  <span className="text-caption text-muted">{!g ? "no guide" : !g.published ? "not published" : g.is_placeholder ? "placeholder" : "live"}</span>
                </span>
                <Link href={`/content/edit?table=city_guides&key=${c.slug}`} className={linkAction} aria-label={`Edit the ${c.name} guide`}>
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Insights posts" action={<Link href="/content/edit?table=posts" className={linkAction}>New post</Link>}>
        {posts?.length ? (
          <ul className="divide-y divide-line">
            {posts.map((p) => (
              <li key={p.slug} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="font-body text-body-sm text-ink">
                  {p.title} <span className="text-caption text-muted">{!p.published ? "not published" : p.is_placeholder ? "placeholder" : `live since ${fmtWhen(p.published_at)}`}</span>
                </span>
                <Link href={`/content/edit?table=posts&key=${p.slug}`} className={linkAction} aria-label={`Edit “${p.title}”`}>
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={mutedCls}>No posts yet.</p>
        )}
      </Panel>

      <Panel title="Testimonials" action={<Link href="/content/edit?table=testimonials" className={linkAction}>New testimonial</Link>}>
        {quotes?.length ? (
          <ul className="divide-y divide-line">
            {quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="font-body text-body-sm text-ink">
                  {q.author_display}{" "}
                  <span className="text-caption text-muted">
                    {!q.published ? "not published" : q.is_placeholder ? "placeholder" : "live"}
                    {q.published && !q.is_placeholder && !q.permission_confirmed ? " · permission not recorded" : ""}
                  </span>
                </span>
                <Link href={`/content/edit?table=testimonials&key=${q.id}`} className={linkAction} aria-label={`Edit the testimonial from ${q.author_display}`}>
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={mutedCls}>No testimonials yet.</p>
        )}
      </Panel>

      {published.length > 0 && <Panel title="Recently published">{revisionList(published, "")}</Panel>}
    </ConsoleShell>
  );
}

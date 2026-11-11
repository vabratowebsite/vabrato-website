import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@vabrato/ui/markdown";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { btnSecondary, inputCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { STATUS_LABEL, TABLE_LABEL, asBody, checkContent, revisionLabel, sitePath, type GuideBody, type PostBody, type TestimonialBody } from "@/lib/content";
import { publishContentAction, rejectContentAction, submitContentAction, unpublishContentAction } from "@/lib/content-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// One revision: preview, Fair Housing check, and the next step (send for
// approval, or publish / send back for the acting lead admin).
export const dynamic = "force-dynamic";

const DONE: Record<string, string> = {
  sent: "Sent to Mark for approval.",
  published: "Published.",
  rejected: "Sent back to the author.",
  unpublished: "Taken off the website.",
};

const STATUS_TONE = { draft: "neutral", submitted: "gold", rejected: "red", published: "green" } as const;

export default async function RevisionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; done?: string; site?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { saved, done, site } = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: rev }, { data: acting }, { data: cities }] = await Promise.all([
    supabase.from("content_revisions").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("is_acting_lead_admin"),
    supabase.from("cities").select("slug, name"),
  ]);
  if (!rev) notFound();
  const people = [rev.created_by, rev.reviewed_by].filter((x): x is string => Boolean(x));
  const { data: names } = people.length ? await supabase.from("profiles").select("id, full_name, email").in("id", people) : { data: [] };
  const who = (pid: string | null) => (pid ? (names ?? []).find((n) => n.id === pid)?.full_name || (names ?? []).find((n) => n.id === pid)?.email || "Staff" : "Staff");
  const cityName = (slug: string) => (cities ?? []).find((c) => c.slug === slug)?.name;

  const body = asBody(rev.body);
  const check = checkContent(body);
  const mine = rev.created_by === profile.id;
  const editable = (rev.status === "draft" || rev.status === "rejected") && (mine || Boolean(acting));
  const title = revisionLabel(rev.table_name, rev.row_key, body, cityName);
  const path = sitePath(rev.table_name, rev.row_key);

  return (
    <ConsoleShell profile={profile} current="content" eyebrow={TABLE_LABEL[rev.table_name].one} title={title}>
      {saved && rev.status === "draft" && (
        <p role="status" className={okCls}>
          Draft saved.
        </p>
      )}
      {done && DONE[done] && (
        <p role="status" className={okCls}>
          {DONE[done]}
          {(done === "published" || done === "unpublished") && (site === "now" ? " The website is updated." : " The website will show it within 15 minutes.")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 font-body text-body-sm text-ink">
        <Pill tone={STATUS_TONE[rev.status]}>{STATUS_LABEL[rev.status]}</Pill>
        <span>
          By {who(rev.created_by)} · updated {fmtWhen(rev.updated_at)}
          {rev.reviewed_by && ` · ${rev.status === "published" ? "approved" : "reviewed"} by ${who(rev.reviewed_by)} ${fmtWhen(rev.reviewed_at)}`}
        </span>
        {rev.status === "published" && path && (
          <a href={`${process.env.PUBLIC_SITE_URL ?? ""}${path}`} className="text-navy underline">
            View on the website
          </a>
        )}
      </div>
      {rev.review_note && rev.status === "rejected" && (
        <p className="border-l-4 border-gold bg-gold-50 p-3 font-body text-body-sm text-ink">Note from {who(rev.reviewed_by)}: {rev.review_note}</p>
      )}

      <Panel title="Fair Housing check">
        {check.issues.length === 0 ? (
          <p className={okCls}>No flagged phrases.</p>
        ) : (
          <>
            <p className="mb-3 font-body text-body-sm text-ink">
              {check.blocking ? "Reword the phrases marked “Must change” before this can be sent or published." : "Nothing blocks this. Check the phrases below read as facts about the place."}
            </p>
            <ul className="space-y-2">
              {check.issues.map((i) => (
                <li key={`${i.level}-${i.match}`} className="font-body text-body-sm text-ink">
                  <Pill tone={i.level === "block" ? "red" : "gold"}>{i.level === "block" ? "Must change" : "Check"}</Pill> <q>{i.match}</q>: {i.reason}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={`${mutedCls} mt-3`}>An automatic check of common phrasing. It doesn&apos;t replace reading the copy.</p>
      </Panel>

      <Panel title="Preview">
        <Preview table={rev.table_name} body={body} />
      </Panel>

      <Panel title="Next step">
        <div className="space-y-6">
          {editable && (
            <div className="flex flex-wrap items-start gap-3">
              <Link href={`/content/edit?rev=${rev.id}`} className={btnSecondary}>
                Edit
              </Link>
              <ActionForm action={submitContentAction.bind(null, rev.id)} submitLabel="Send for approval" pendingLabel="Sending…" className="flex flex-wrap items-start gap-3" />
            </div>
          )}
          {rev.status === "submitted" && !acting && <p className={mutedCls}>Waiting for Mark (or Viv while Mark is away) to approve it.</p>}
          {rev.status === "submitted" && acting && (
            <>
              <ActionForm action={publishContentAction.bind(null, rev.id)} submitLabel="Approve and publish" pendingLabel="Publishing…" className="space-y-2">
                <p className={mutedCls}>Publishing replaces what&apos;s on the website now.</p>
              </ActionForm>
              <ActionForm action={rejectContentAction.bind(null, rev.id)} submitLabel="Send back" pendingLabel="Sending…" secondary className="space-y-3">
                <div>
                  <label htmlFor="note" className={labelCls}>
                    What needs to change <span className="text-muted">(required)</span>
                  </label>
                  <textarea id="note" name="note" required maxLength={1000} rows={3} className={`${inputCls} mt-1`} />
                </div>
              </ActionForm>
            </>
          )}
          {rev.status === "published" && acting && rev.row_key && (
            <ActionForm action={unpublishContentAction.bind(null, rev.id, rev.table_name, rev.row_key)} submitLabel="Take it off the website" pendingLabel="Removing…" secondary className="space-y-2">
              <p className={mutedCls}>Hides it from the website. Edit and approve a new revision to bring it back.</p>
            </ActionForm>
          )}
          {!editable && rev.status !== "submitted" && !(rev.status === "published" && acting) && <p className={mutedCls}>Nothing to do here.</p>}
        </div>
      </Panel>
    </ConsoleShell>
  );
}

function Preview({ table, body }: { table: "city_guides" | "posts" | "testimonials"; body: ReturnType<typeof asBody> }) {
  if (table === "posts") {
    const p = body as PostBody;
    return (
      <article className="space-y-4">
        <h2 className="font-subhead text-subhead-lg text-ink">{p.title}</h2>
        {p.excerpt && <p className="font-body text-body text-muted">{p.excerpt}</p>}
        <Markdown>{p.body_md}</Markdown>
      </article>
    );
  }
  if (table === "testimonials") {
    const q = body as TestimonialBody;
    return (
      <figure className="space-y-2">
        <blockquote className="border-l-2 border-gold pl-4 font-body text-body text-ink">{q.quote}</blockquote>
        <figcaption className="font-body text-body-sm text-ink">
          {q.author_display} · {q.role} {q.source ? `· ${q.source}` : <span className="text-red">· no source yet</span>}
          {!q.permission_confirmed && <span className="text-red"> · client permission not recorded</span>}
        </figcaption>
      </figure>
    );
  }
  const g = body as GuideBody;
  return (
    <div className="space-y-4 font-body text-body text-ink">
      {g.intro.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="max-w-prose">
          {para}
        </p>
      ))}
      {g.neighborhoods.length > 0 && (
        <>
          <h3 className="font-subhead text-subhead-md">Neighborhoods</h3>
          <dl className="space-y-2">
            {g.neighborhoods.map((h) => (
              <div key={h.name}>
                <dt className="font-medium">{h.name}</dt>
                <dd>{h.summary}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {g.school_links.length > 0 && (
        <>
          <h3 className="font-subhead text-subhead-md">Schools</h3>
          <ul className="list-disc pl-6">
            {g.school_links.map((s) => (
              <li key={s.url}>
                {s.name} <span className="text-caption text-muted">{s.url}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {g.faq.length > 0 && (
        <>
          <h3 className="font-subhead text-subhead-md">Questions</h3>
          <dl className="space-y-2">
            {g.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-medium">{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

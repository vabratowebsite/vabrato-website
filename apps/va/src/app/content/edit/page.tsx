import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@vabrato/ui/web";
import type { ContentTable } from "@vabrato/db";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { inputCls, labelCls, mutedCls } from "@/components/ui";
import {
  CONTENT_TABLES,
  LIST_SLOTS,
  POST_KINDS,
  ROLES,
  TABLE_LABEL,
  asBody,
  bodyFromLive,
  type ContentBody,
  type GuideBody,
  type PostBody,
  type TestimonialBody,
} from "@/lib/content";
import { saveDraftAction } from "@/lib/content-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Content editor: a new draft, a draft of a live page (prefilled from what's
// on the website), or an existing draft / sent-back revision (?rev=).
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export default async function EditContent({ searchParams }: { searchParams: Promise<{ table?: string; key?: string; rev?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const sp = await searchParams;
  const supabase = await supabaseServer();

  let table = (CONTENT_TABLES as string[]).includes(sp.table ?? "") ? (sp.table as ContentTable) : null;
  let key = sp.key?.slice(0, 120) || null;
  let body: ContentBody | null = null;
  let revisionId: string | null = null;
  let note: string | null = null;

  if (sp.rev) {
    if (!UUID.test(sp.rev)) notFound();
    const { data: rev } = await supabase.from("content_revisions").select("id, table_name, row_key, body, status, review_note").eq("id", sp.rev).maybeSingle();
    if (!rev) notFound();
    if (rev.status !== "draft" && rev.status !== "rejected") return redirectNote(profile, `/content/${rev.id}`);
    table = rev.table_name;
    key = rev.row_key;
    body = asBody(rev.body);
    revisionId = rev.id;
    note = rev.review_note;
  }
  if (!table) notFound();

  const [{ data: cities }, live] = await Promise.all([
    supabase.from("cities").select("slug, name").order("name"),
    !body && key ? loadLive(supabase, table, key) : Promise.resolve(null),
  ]);
  if (!body) body = bodyFromLive(table, live);
  const { data: openRevs } =
    !revisionId && key
      ? await supabase.from("content_revisions").select("id, status").eq("table_name", table).eq("row_key", key).in("status", ["draft", "submitted", "rejected"]).limit(5)
      : { data: [] };

  const what = TABLE_LABEL[table].one;
  const title = revisionId ? `Edit ${what.toLowerCase()} draft` : key ? `Edit ${what.toLowerCase()}` : `New ${what.toLowerCase()}`;

  return (
    <ConsoleShell profile={profile} current="content" eyebrow="Content" title={title}>
      {note && (
        <p role="status" className="border-l-4 border-gold bg-gold-50 p-3 font-body text-body-sm text-ink">
          Mark&apos;s note: {note}
        </p>
      )}
      {(openRevs ?? []).length > 0 && (
        <p className="border-l-4 border-navy bg-navy-50 p-3 font-body text-body-sm text-ink">
          This page already has an open revision:{" "}
          {(openRevs ?? []).map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/content/${r.id}`} className="text-navy underline">
                {r.status}
              </Link>
            </span>
          ))}
          . Saving here starts another one.
        </p>
      )}
      <Panel title={what}>
        <ActionForm action={saveDraftAction.bind(null, table, revisionId)} submitLabel="Save draft" pendingLabel="Saving…" className="space-y-6">
          {table === "city_guides" && <GuideFields cities={cities ?? []} cityKey={key} body={body as GuideBody | null} />}
          {table === "posts" && <PostFields slug={key} locked={Boolean(live) || Boolean(revisionId && key)} body={body as PostBody | null} />}
          {table === "testimonials" && <TestimonialFields id={key} body={body as TestimonialBody | null} />}
          <p className={mutedCls}>Saving keeps this as a draft. You send it for approval from the next page, after the Fair Housing check.</p>
        </ActionForm>
      </Panel>
    </ConsoleShell>
  );
}

function redirectNote(profile: Awaited<ReturnType<typeof requireSignIn>>["profile"], href: string) {
  return (
    <ConsoleShell profile={profile} current="content" eyebrow="Content" title="Can't edit this revision">
      <p className="font-body text-body-sm text-ink">
        It&apos;s waiting for approval or already published.{" "}
        <Link href={href} className="text-navy underline">
          Open it
        </Link>
        .
      </p>
    </ConsoleShell>
  );
}

async function loadLive(supabase: Awaited<ReturnType<typeof supabaseServer>>, table: ContentTable, key: string): Promise<Record<string, unknown> | null> {
  if (table === "city_guides") return (await supabase.from("city_guides").select("intro, neighborhoods, school_links, faq").eq("city_slug", key).maybeSingle()).data;
  if (table === "posts") return (await supabase.from("posts").select("kind, title, excerpt, body_md").eq("slug", key).maybeSingle()).data;
  if (!UUID.test(key)) return null;
  return (await supabase.from("testimonials").select("author_display, role, quote, source, sort, permission_confirmed").eq("id", key).maybeSingle()).data;
}

function Field({ label, name, defaultValue, hint, required, maxLength, rows }: { label: string; name: string; defaultValue?: string; hint?: string; required?: boolean; maxLength?: number; rows?: number }) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div>
      <label htmlFor={name} className={labelCls}>
        {label}
        {required && <span className="text-muted"> (required)</span>}
      </label>
      {hint && (
        <p id={hintId} className={`${mutedCls} mt-1`}>
          {hint}
        </p>
      )}
      {rows ? (
        <textarea id={name} name={name} defaultValue={defaultValue} required={required} maxLength={maxLength} rows={rows} aria-describedby={hintId} className={`${inputCls} mt-1`} />
      ) : (
        <input id={name} name={name} defaultValue={defaultValue} required={required} maxLength={maxLength} aria-describedby={hintId} className={`${inputCls} mt-1`} />
      )}
    </div>
  );
}

function GuideFields({ cities, cityKey, body }: { cities: { slug: string; name: string }[]; cityKey: string | null; body: GuideBody | null }) {
  const hoods = body?.neighborhoods ?? [];
  const schools = body?.school_links ?? [];
  const faq = body?.faq ?? [];
  const slots = (n: number, max: number) => Array.from({ length: Math.min(max, n + 2) }, (_, i) => i);
  return (
    <>
      <div>
        <label htmlFor="key" className={labelCls}>
          City <span className="text-muted">(required)</span>
        </label>
        <select id="key" name="key" defaultValue={cityKey ?? ""} required className={`${inputCls} mt-1 max-w-sm`}>
          <option value="">Choose a city</option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Field label="Introduction" name="intro" defaultValue={body?.intro} required maxLength={6000} rows={8} hint="About the place: downtown, parks, transit, history. Not about who lives there (Fair Housing)." />
      <fieldset className="space-y-3">
        <legend className={labelCls}>Neighborhoods</legend>
        {slots(hoods.length, LIST_SLOTS.neighborhoods).map((i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field label={`Neighborhood ${i + 1} name`} name={`hood_name_${i}`} defaultValue={hoods[i]?.name} maxLength={80} />
            <Field label={`Neighborhood ${i + 1} summary`} name={`hood_summary_${i}`} defaultValue={hoods[i]?.summary} maxLength={600} rows={2} />
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className={labelCls}>School district links</legend>
        <p className={mutedCls}>Official district or school sites only (https). No ratings or rankings.</p>
        {slots(schools.length, LIST_SLOTS.school_links).map((i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-2">
            <Field label={`Link ${i + 1} name`} name={`school_name_${i}`} defaultValue={schools[i]?.name} maxLength={120} />
            <Field label={`Link ${i + 1} address (https://…)`} name={`school_url_${i}`} defaultValue={schools[i]?.url} maxLength={500} />
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className={labelCls}>Questions and answers</legend>
        {slots(faq.length, LIST_SLOTS.faq).map((i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field label={`Question ${i + 1}`} name={`faq_q_${i}`} defaultValue={faq[i]?.q} maxLength={200} />
            <Field label={`Answer ${i + 1}`} name={`faq_a_${i}`} defaultValue={faq[i]?.a} maxLength={1500} rows={2} />
          </div>
        ))}
      </fieldset>
    </>
  );
}

function PostFields({ slug, locked, body }: { slug: string | null; locked: boolean; body: PostBody | null }) {
  return (
    <>
      <Field label="Title" name="title" defaultValue={body?.title} required maxLength={200} />
      {locked && slug ? (
        <div>
          <input type="hidden" name="key" value={slug} />
          <p className={labelCls}>Web address</p>
          <p className="mt-1 font-body text-body-sm text-ink">/insights/{slug}</p>
        </div>
      ) : (
        <Field label="Web address" name="key" defaultValue={slug ?? ""} required maxLength={100} hint="Lowercase words joined by hyphens, e.g. san-carlos-market-november. Shown as /insights/your-address." />
      )}
      <div>
        <label htmlFor="kind" className={labelCls}>
          Kind
        </label>
        <select id="kind" name="kind" defaultValue={body?.kind ?? "insight"} className={`${inputCls} mt-1 max-w-xs`}>
          {POST_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <Field label="Summary" name="excerpt" defaultValue={body?.excerpt} maxLength={400} rows={2} hint="One or two sentences for the Insights list." />
      <Field
        label="Article"
        name="body_md"
        defaultValue={body?.body_md}
        required
        maxLength={50000}
        rows={18}
        hint="Markdown: ## for headings, **bold**, *italic*, - for lists, [text](https://…) for links. Images and HTML aren't shown."
      />
    </>
  );
}

function TestimonialFields({ id, body }: { id: string | null; body: TestimonialBody | null }) {
  return (
    <>
      {id && <input type="hidden" name="key" value={id} />}
      <Field label="Name as shown" name="author_display" defaultValue={body?.author_display} required maxLength={60} hint="First name and last initial, e.g. Sam Q." />
      <div>
        <label htmlFor="role" className={labelCls}>
          Client was a
        </label>
        <select id="role" name="role" defaultValue={body?.role ?? "buyer"} className={`${inputCls} mt-1 max-w-xs`}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <Field label="Quote" name="quote" defaultValue={body?.quote} required maxLength={1200} rows={5} />
      <Field label="Source" name="source" defaultValue={body?.source} maxLength={200} hint="Where it came from, e.g. Zillow review, Nov 2026, or Email to Mark, Oct 2026. Required to publish." />
      <Field label="Order" name="sort" defaultValue={String(body?.sort ?? 0)} maxLength={4} hint="Lower numbers show first." />
      <div className="flex items-start gap-3">
        <input id="permission_confirmed" name="permission_confirmed" type="checkbox" defaultChecked={body?.permission_confirmed} className="mt-1 h-5 w-5 accent-navy" />
        <label htmlFor="permission_confirmed" className={labelCls}>
          The client agreed to us publishing this quote with this name. Required to publish.
        </label>
      </div>
    </>
  );
}

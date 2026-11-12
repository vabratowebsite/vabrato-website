import { Panel } from "@vabrato/ui/web";
import { agentPhotoUrl } from "@vabrato/lib";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { inputCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { removePhotoAction, saveProfileAction, uploadPhotoAction } from "@/lib/profile-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Your public agent profile (team page and /team/<slug>). You edit it
// directly; no approval needed (SPEC <approvals>). Mark publishes profiles
// and links logins to them.
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ done?: string; site?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const { data: row } = await supabase
    .from("agent_profiles")
    .select("slug, display_name, title, bio, photo_path, phone, email, outlook, history, start_year, video_youtube_id, published")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!row) {
    return (
      <ConsoleShell profile={profile} current="profile" eyebrow="Account" title="My profile">
        <Panel title="Not linked yet">
          <p className="font-body text-body-sm text-ink">Your login isn&apos;t linked to a public agent profile. Ask Mark to link it; then you can edit your bio and photo here.</p>
        </Panel>
      </ConsoleShell>
    );
  }

  const { done, site: siteNow } = await searchParams;
  const photo = agentPhotoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, row.photo_path);
  const site = process.env.PUBLIC_SITE_URL ?? "";
  const field = (name: keyof typeof row, label: string, opts: { rows?: number; maxLength: number; hint?: string; type?: string } = { maxLength: 200 }) => (
    <div>
      <label htmlFor={name} className={labelCls}>
        {label}
      </label>
      {opts.hint && (
        <p id={`${name}-hint`} className={`${mutedCls} mt-1`}>
          {opts.hint}
        </p>
      )}
      {opts.rows ? (
        <textarea id={name} name={name} rows={opts.rows} maxLength={opts.maxLength} defaultValue={String(row[name] ?? "")} aria-describedby={opts.hint ? `${name}-hint` : undefined} className={`${inputCls} mt-1`} />
      ) : (
        <input id={name} name={name} type={opts.type ?? "text"} maxLength={opts.maxLength} defaultValue={String(row[name] ?? "")} aria-describedby={opts.hint ? `${name}-hint` : undefined} className={`${inputCls} mt-1`} />
      )}
    </div>
  );

  return (
    <ConsoleShell profile={profile} current="profile" eyebrow="Account" title="My profile">
      {done === "photo_removed" && (
        <p role="status" className={okCls}>
          Photo removed. {siteNow === "now" ? "The website is updated." : "The website will show it within 15 minutes."}
        </p>
      )}
      <p className={mutedCls}>
        {row.published ? (
          <>
            Live at{" "}
            <a href={`${site}/team/${row.slug}`} className="text-navy underline">
              /team/{row.slug}
            </a>
            . Changes show on the website when you save.
          </>
        ) : (
          "Not on the website yet: Mark publishes profiles. You can get it ready here."
        )}
      </p>

      <Panel title="Photo">
        <div className="flex flex-wrap items-start gap-6">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, small preview
            <img src={photo} alt={`Current photo of ${row.display_name}`} width={160} height={200} className="h-[200px] w-[160px] border border-line object-cover" />
          ) : (
            <div className="flex h-[200px] w-[160px] items-center justify-center border border-dashed border-muted font-body text-caption text-muted">No photo</div>
          )}
          <div className="space-y-4">
            <ActionForm action={uploadPhotoAction} submitLabel="Upload photo" pendingLabel="Uploading…" resetOnOk>
              <div>
                <label htmlFor="photo" className={labelCls}>
                  New photo
                </label>
                <p id="photo-hint" className={`${mutedCls} mt-1`}>
                  JPEG, PNG or WebP, up to 4 MB. A portrait (4:5) works best.
                </p>
                <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-describedby="photo-hint" className="mt-2 block font-body text-body-sm text-ink" />
              </div>
            </ActionForm>
            {photo && <ActionForm action={removePhotoAction} submitLabel="Remove photo" pendingLabel="Removing…" secondary />}
          </div>
        </div>
      </Panel>

      <Panel title="About you">
        <ActionForm action={saveProfileAction} submitLabel="Save profile" className="space-y-5">
          <p className="font-body text-body-sm text-ink">
            <span className="font-medium">{row.display_name}</span> <span className="text-muted">(Mark changes names and web addresses)</span>
          </p>
          {field("title", "Title", { maxLength: 80, hint: "e.g. Broker, Realtor®" })}
          {field("bio", "Bio", { rows: 8, maxLength: 4000, hint: "Your experience and how you work. Not who you serve best (Fair Housing)." })}
          {field("outlook", "Market outlook", { rows: 4, maxLength: 2000 })}
          {field("history", "Background", { rows: 4, maxLength: 4000 })}
          <div className="grid gap-5 sm:grid-cols-2">
            {field("phone", "Business phone", { maxLength: 30, type: "tel" })}
            {field("email", "Business email", { maxLength: 120, type: "email" })}
            {field("start_year", "In real estate since", { maxLength: 4, hint: "Year, e.g. 2012" })}
            {field("video_youtube_id", "YouTube video ID", { maxLength: 11, hint: "The 11 characters after v= in the video link" })}
          </div>
        </ActionForm>
      </Panel>
    </ConsoleShell>
  );
}

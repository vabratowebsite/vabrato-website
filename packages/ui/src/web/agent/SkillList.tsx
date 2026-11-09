import { CheckCircleIcon } from "../icons";

export interface Skill {
  title: string;
  detail?: string;
}

/** Skills with gold check icons (mockup 09 "My skills at work for you"). */
export function SkillList({ title, items }: { title?: string; items: Skill[] }) {
  return (
    <div>
      {title && <h2 className="mb-4 font-subhead text-subhead-md text-ink">{title}</h2>}
      <ul className="space-y-4">
        {items.map((s) => (
          <li key={s.title} className="flex gap-3">
            <CheckCircleIcon size={20} className="flex-none text-gold-ink" />
            <div>
              <p className="font-body text-caption font-bold uppercase tracking-[0.06em] text-ink">
                {s.title}
              </p>
              {s.detail && <p className="font-body text-caption text-muted">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

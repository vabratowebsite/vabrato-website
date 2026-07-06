import type { ReactNode } from "react";
import { T } from "./theme";

export function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
      className="rounded-2xl p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-base">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

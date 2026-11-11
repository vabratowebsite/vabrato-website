"use client";

import { useActionState, useMemo, useState } from "react";
import type { Vendor } from "@vabrato/db";
import { Panel, Pill, cx, focusLight } from "@vabrato/ui/web";
import { btnPrimary, errorCls, inputCls, labelCls, linkAction, linkDanger, mutedCls } from "@/components/ui";
import { addVendorAction, deleteVendorAction, toggleVendorPreferredAction, type FormState } from "@/lib/actions";

export function VendorsView({ vendors }: { vendors: Vendor[] }) {
  const [role, setRole] = useState("All");
  const [state, formAction, pending] = useActionState<FormState, FormData>(addVendorAction, { error: null });
  const roles = useMemo(() => ["All", ...Array.from(new Set(vendors.map((v) => v.role))).sort()], [vendors]);
  const shown = role === "All" ? vendors : vendors.filter((v) => v.role === role);

  return (
    <div className="space-y-6">
      <Panel title="Add a vendor">
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelCls}>
            Name
            <input name="name" required className={`${inputCls} mt-1`} />
          </label>
          <label className={labelCls}>
            Role (for example, Staging)
            <input name="role" required className={`${inputCls} mt-1`} />
          </label>
          <label className={labelCls}>
            Phone (optional)
            <input name="phone" type="tel" className={`${inputCls} mt-1`} />
          </label>
          <label className={labelCls}>
            Email (optional)
            <input name="email" type="email" className={`${inputCls} mt-1`} />
          </label>
          <label className="flex min-h-[44px] items-center gap-3 font-body text-body-sm text-ink sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="preferred" className="h-5 w-5 accent-navy" /> Preferred vendor
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Adding…" : "Add vendor"}
            </button>
          </div>
          {state.error && (
            <p role="alert" className={`${errorCls} sm:col-span-2 lg:col-span-4`}>
              {state.error}
            </p>
          )}
        </form>
      </Panel>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-2 w-full font-body text-body-sm font-medium text-ink">Filter by role</legend>
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            aria-pressed={role === r}
            className={cx("min-h-[44px] border px-4 font-body text-body-sm", role === r ? "border-navy bg-navy text-white" : "border-line bg-white text-navy", focusLight)}
          >
            {r}
          </button>
        ))}
      </fieldset>

      {shown.length === 0 ? (
        <p className={mutedCls}>No vendors yet. Add your first one above.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((v) => (
            <li key={v.id} className="border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-body text-body font-medium text-ink">{v.name}</p>
                  <p className={mutedCls}>{v.role}</p>
                </div>
                {v.preferred && <Pill tone="gold">Preferred</Pill>}
              </div>
              <div className="mt-3 space-y-1 font-body text-body-sm">
                {v.phone && (
                  <a href={`tel:${v.phone}`} className="block text-navy underline">
                    {v.phone}
                  </a>
                )}
                {v.email && (
                  <a href={`mailto:${v.email}`} className="block truncate text-navy underline">
                    {v.email}
                  </a>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={toggleVendorPreferredAction.bind(null, v.id, !v.preferred)}>
                  <button type="submit" className={linkAction}>
                    {v.preferred ? "Unmark preferred" : "Mark preferred"}
                    <span className="sr-only">: {v.name}</span>
                  </button>
                </form>
                <form action={deleteVendorAction.bind(null, v.id)}>
                  <button type="submit" className={linkDanger}>
                    Delete<span className="sr-only"> {v.name}</span>
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

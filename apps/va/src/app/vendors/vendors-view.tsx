"use client";

import { useActionState, useMemo, useState } from "react";
import type { Vendor } from "@vabrato/db";
import { T } from "@vabrato/ui";
import {
  addVendorAction,
  deleteVendorAction,
  toggleVendorPreferredAction,
  type FormState,
} from "@/lib/actions";

const inputStyle = { border: `1px solid ${T.line}`, background: T.surface };

export function VendorsView({ vendors }: { vendors: Vendor[] }) {
  const [role, setRole] = useState("All");
  const [state, formAction, pending] = useActionState<FormState, FormData>(addVendorAction, {
    error: null,
  });

  const roles = useMemo(
    () => ["All", ...Array.from(new Set(vendors.map((v) => v.role))).sort()],
    [vendors],
  );
  const shown = role === "All" ? vendors : vendors.filter((v) => v.role === role);

  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl p-5"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        <h3 className="mb-3 font-serif text-base">Add a vendor</h3>
        <form action={formAction} className="grid gap-2 sm:grid-cols-5">
          <input name="name" required placeholder="Name" className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          <input name="role" required placeholder="Role (e.g. Staging)" className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          <input name="phone" placeholder="Phone" className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          <input name="email" type="email" placeholder="Email" className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: T.ink, color: T.gold }}
          >
            {pending ? "Adding…" : "Add"}
          </button>
          <label className="flex items-center gap-2 text-xs sm:col-span-5" style={{ color: T.muted }}>
            <input type="checkbox" name="preferred" /> Preferred vendor
          </label>
          {state.error && (
            <p className="text-sm sm:col-span-5" style={{ color: T.red }}>
              {state.error}
            </p>
          )}
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: T.muted }}>
          Role
        </span>
        {roles.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background: role === r ? T.ink : T.surface,
              color: role === r ? T.gold : T.muted,
              border: `1px solid ${role === r ? T.ink : T.line}`,
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm" style={{ color: T.muted }}>
          No vendors yet — add your first one above.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((v) => (
            <div
              key={v.id}
              className="rounded-2xl p-4"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    {v.name}
                    {v.preferred && <span style={{ color: T.gold }}>★</span>}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: T.muted }}>
                    {v.role}
                  </div>
                </div>
                <form action={toggleVendorPreferredAction.bind(null, v.id, !v.preferred)}>
                  <button
                    className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: v.preferred ? `${T.gold}22` : T.lineSoft,
                      color: v.preferred ? T.goldDeep : T.muted,
                    }}
                  >
                    {v.preferred ? "Preferred" : "Prefer?"}
                  </button>
                </form>
              </div>
              <div className="mt-3 space-y-1.5 text-xs" style={{ color: T.muted }}>
                {v.phone && (
                  <a href={`tel:${v.phone}`} className="block">
                    {v.phone}
                  </a>
                )}
                {v.email && (
                  <a href={`mailto:${v.email}`} className="block truncate">
                    {v.email}
                  </a>
                )}
              </div>
              <form action={deleteVendorAction.bind(null, v.id)} className="mt-3">
                <button className="text-xs" style={{ color: T.red }}>
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

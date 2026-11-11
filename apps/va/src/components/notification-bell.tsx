"use client";

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { BellIcon, cx, focusLight } from "@vabrato/ui/web";

// In-console alerts (S6): polls every 20 s while the tab is open. With the
// browser's permission, a new alert also shows as a desktop notification
// while the console tab is in the background. No push server: closing the
// console stops alerts (background Web Push is a later step).

interface Item {
  id: number;
  kind: string;
  title: string;
  href: string;
  createdAt: string;
  unread: boolean;
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } } });

export function NotificationBell() {
  return (
    <QueryClientProvider client={client}>
      <Bell />
    </QueryClientProvider>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Bell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const seen = useRef<Set<number> | null>(null);
  const panelId = useId();
  const { data } = useQuery({
    queryKey: ["staff-notifications"],
    queryFn: async (): Promise<{ unread: number; items: Item[] }> => {
      const res = await fetch("/api/staff/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: 20_000,
  });
  const markRead = useMutation({
    mutationFn: () => fetch("/api/staff/notifications", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-notifications"] }),
  });

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  // Desktop notification for alerts that arrive after the page loaded.
  useEffect(() => {
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.items.map((i) => i.id));
      return;
    }
    const fresh = data.items.filter((i) => i.unread && !seen.current!.has(i.id));
    fresh.forEach((i) => seen.current!.add(i.id));
    if (fresh.length && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      const n = new Notification(fresh.length === 1 ? fresh[0]!.title : `${fresh.length} new alerts`, { body: "Vabrato agent console", tag: "vabrato-console" });
      n.onclick = () => {
        window.focus();
        window.location.assign(fresh[0]!.href);
      };
    }
  }, [data]);

  const unread = data?.unread ?? 0;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cx("relative flex h-11 w-11 items-center justify-center text-navy", focusLight)}
      >
        <BellIcon size={20} />
        <span className="sr-only">Alerts{unread ? `, ${unread} new` : ""}</span>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-gold px-1 text-[11px] font-bold text-ink">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <span role="status" className="sr-only">
        {unread ? `${unread} new alert${unread === 1 ? "" : "s"}` : ""}
      </span>
      {open && (
        <div id={panelId} className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] border border-line bg-white p-4 shadow-pop">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-subhead text-subhead-sm text-ink">Alerts</h2>
            {unread > 0 && (
              <button type="button" onClick={() => markRead.mutate()} className={cx("min-h-[44px] px-2 font-body text-body-sm text-navy underline", focusLight)}>
                Mark all read
              </button>
            )}
          </div>
          {data?.items.length ? (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {data.items.map((i) => (
                <li key={i.id}>
                  <a href={i.href} className={cx("block py-2 font-body text-body-sm", i.unread ? "font-medium text-ink" : "text-muted", focusLight)}>
                    {i.unread && <span className="sr-only">New: </span>}
                    {i.title}
                    <span className="block text-caption text-muted">{fmt(i.createdAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body text-body-sm text-muted">No alerts yet.</p>
          )}
          {permission === "default" && (
            <button
              type="button"
              onClick={async () => setPermission(await Notification.requestPermission())}
              className={cx("mt-3 min-h-[44px] w-full border border-navy px-3 font-body text-body-sm text-navy", focusLight)}
            >
              Turn on desktop alerts
            </button>
          )}
          {permission === "denied" && <p className="mt-3 font-body text-caption text-muted">Desktop alerts are blocked in this browser&apos;s settings.</p>}
        </div>
      )}
    </div>
  );
}

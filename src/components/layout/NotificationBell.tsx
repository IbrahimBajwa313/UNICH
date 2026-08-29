"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { clsx } from "@/lib/format";

type NotificationItem = {
  id: string;
  dedupeKey: string;
  type: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  read: boolean;
  createdAt: string;
};

const POLL_MS = 60_000;

function badgeTone(severity: NotificationItem["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

/**
 * Where clicking a notification should take you. `dedupeKey` is built in
 * `buildAlerts` (src/lib/notifications/alerts.ts) — `low-`/`dead-` prefixes
 * carry a product id, but the Low Stock / Inventory pages don't yet support
 * deep-linking to one product, so those land on the relevant list page.
 * Report-shaped alerts deep-link into the Reports catalog via `?report=`.
 */
function resolveHref(n: NotificationItem): string | null {
  switch (n.type) {
    case "low_stock":
      return "/inventory/low-stock";
    case "dead_stock":
      return "/inventory";
    case "report":
      return "/reports";
    case "receivables":
      return "/reports?report=customers-credit-follow-up";
    case "payables":
      return "/reports?report=purchases-by-supplier";
    default:
      return null;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: NotificationItem[]; unreadCount: number }>(
        "/api/notifications",
      );
      setItems(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      // silent — bell just stays at its last known state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), POLL_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      });
    } catch {
      void load();
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ all: true }),
      });
    } catch {
      void load();
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-muted transition hover:border-gold/40 hover:text-ink"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 animate-[pulse-soft_2s_ease-in-out_infinite] rounded-full bg-coral" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-2xl border border-line bg-paper shadow-soft">
          <div className="flex items-center justify-between border-b border-line/70 px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-deep"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-80 overflow-y-auto scrollbar-thin">
            {loading && items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-ink-muted">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-ink-muted">
                No notifications — all clear.
              </li>
            ) : (
              items.map((n) => {
                const href = resolveHref(n);
                return (
                  <li
                    key={n.id}
                    onClick={() => {
                      if (!n.read) void markRead(n.id);
                      if (href) {
                        setOpen(false);
                        router.push(href);
                      }
                    }}
                    title={href ? "Open" : undefined}
                    className={clsx(
                      "cursor-pointer border-b border-line/50 px-3 py-2.5 transition last:border-b-0 hover:bg-mist/60",
                      !n.read && "bg-mist/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={clsx(
                          "text-xs",
                          n.read ? "text-ink-muted" : "font-medium text-ink",
                        )}
                      >
                        {n.title}
                      </p>
                      <Badge tone={badgeTone(n.severity)} className="shrink-0">
                        {n.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-muted">{n.detail}</p>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

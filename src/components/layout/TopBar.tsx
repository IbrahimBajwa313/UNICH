"use client";

import { Bell, Search, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function TopBar({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line/70 bg-canvas/80 px-6 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative hidden max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            placeholder="Search products, customers, invoices…"
            className="h-9 w-80 rounded-full border border-line bg-paper pr-3 pl-9 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-gold focus:ring-2 focus:ring-gold/25"
          />
        </div>
        {title ? (
          <p className="truncate text-sm font-medium text-ink-muted md:hidden">
            {title}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Badge tone="success" className="hidden sm:inline-flex">
          <Wifi className="h-3 w-3" />
          Online
        </Badge>
        <Badge tone="gold" className="hidden lg:inline-flex">
          Prototype
        </Badge>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-muted transition hover:border-gold/40 hover:text-ink"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 animate-[pulse-soft_2s_ease-in-out_infinite] rounded-full bg-coral" />
        </button>
      </div>
    </header>
  );
}

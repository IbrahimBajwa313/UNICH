"use client";

import { usePathname } from "next/navigation";
import { Bell, Moon, Sun, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useTheme } from "@/components/theme/ThemeProvider";

const PAGE_TITLES: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/pos", label: "POS" },
  { href: "/inventory/low-stock", label: "Low Stock" },
  { href: "/inventory", label: "Inventory" },
  { href: "/formulas", label: "Formulas & BOM" },
  { href: "/production", label: "Production" },
  { href: "/purchases", label: "Purchasing" },
  { href: "/customers", label: "Customers" },
  { href: "/quotations", label: "Quotations" },
  { href: "/reports", label: "Reports" },
  { href: "/expenses", label: "Expenses" },
  { href: "/playground", label: "Playground" },
  { href: "/settings", label: "Settings" },
];

function resolvePageTitle(pathname: string, fallback?: string) {
  if (fallback) return fallback;
  const match = [...PAGE_TITLES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) =>
      t.href === "/" ? pathname === "/" : pathname.startsWith(t.href),
    );
  return match?.label;
}

export function TopBar({ title }: { title?: string }) {
  const pathname = usePathname();
  const pageTitle = resolvePageTitle(pathname, title);
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line/70 bg-canvas/80 px-6 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        {pageTitle ? (
          <p className="truncate text-sm font-semibold tracking-tight text-ink">
            {pageTitle}
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
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-muted transition hover:border-gold/40 hover:text-ink"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
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

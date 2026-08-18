"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Factory,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Beaker,
} from "lucide-react";
import { clsx } from "@/lib/format";
import { useAuth } from "@/components/auth/AuthProvider";
import { navAllowed } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/inventory/low-stock", label: "Low Stock", icon: AlertTriangle },
  { href: "/formulas", label: "Formulas & BOM", icon: FlaskConical },
  { href: "/production", label: "Production", icon: Factory },
  { href: "/purchases", label: "Purchasing", icon: Truck },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/quotations", label: "Quotations", icon: FileText },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/playground", label: "Playground", icon: Beaker },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const role = (user?.role || "sales") as UserRole;
  const branch = user?.branchName || (loading ? "…" : "No branch");
  const name = user?.name || (loading ? "…" : "User");
  const roleLabel = user?.roleLabel || "";

  const visible = nav.filter((item) => navAllowed(item.href, role));
  const ops = visible.filter((item) =>
    [
      "/",
      "/pos",
      "/inventory",
      "/inventory/low-stock",
      "/formulas",
      "/production",
      "/purchases",
      "/customers",
      "/quotations",
    ].includes(item.href),
  );
  const insights = visible.filter(
    (item) => !ops.some((o) => o.href === item.href),
  );

  return (
    <aside className="relative flex h-full w-[268px] shrink-0 flex-col overflow-hidden border-r border-line/60 bg-sidebar text-ink-muted">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 45% at 0% 0%, rgb(123 97 255 / 14%), transparent 55%)",
        }}
      />
      <div className="relative z-10 flex h-full flex-col">
        <div className="border-b border-line/50 px-5 py-5">
          <Link href="/" className="group flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-[0_0_20px_rgb(123_97_255_/_35%)]"
              style={{
                background:
                  "linear-gradient(135deg, #9b87ff 0%, #7b61ff 55%, #f5f5f7 140%)",
              }}
            >
              U
            </span>
            <div>
              <p className="text-[1.2rem] font-semibold leading-none tracking-tight text-ink transition group-hover:text-gold-soft">
                U-niche
              </p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                Perfumes ERP
              </p>
            </div>
          </Link>
          <div className="mt-4 rounded-2xl border border-line bg-paper/60 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
              Branch
            </p>
            <p className="mt-0.5 text-xs font-medium text-ink">{branch}</p>
          </div>
        </div>

        <nav className="scrollbar-hidden flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted/70">
            Operations
          </p>
          {ops.map((item, i) => (
            <NavItem
              key={item.href}
              {...item}
              active={
                item.href === "/inventory"
                  ? pathname === "/inventory"
                  : pathname === item.href
              }
              delay={i}
            />
          ))}
          {insights.length > 0 ? (
            <>
              <p className="mb-2 mt-5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted/70">
                Insights & System
              </p>
              {insights.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  active={pathname === item.href}
                />
              ))}
            </>
          ) : null}
        </nav>

        <div className="border-t border-line/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-gold/15 text-sm font-semibold text-gold-soft">
              {name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{name}</p>
              <p className="text-[11px] text-ink-muted">{roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-mist hover:text-coral"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "animate-slide-in flex items-center gap-2.5 rounded-full px-3 py-2 text-sm whitespace-nowrap transition-all",
        active
          ? "bg-ink font-medium text-canvas shadow-[0_4px_20px_rgb(245_245_247_/_12%)]"
          : "text-ink-muted hover:bg-sidebar-hover hover:text-ink",
      )}
    >
      <Icon
        className={clsx(
          "h-4 w-4 shrink-0",
          active ? "text-canvas" : "opacity-75",
        )}
      />
      <span className="whitespace-nowrap">{label}</span>
      {active ? (
        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
      ) : null}
    </Link>
  );
}

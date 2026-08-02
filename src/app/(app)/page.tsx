"use client";

import Link from "next/link";
import { ArrowRight, AlertTriangle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { SalesMixChart } from "@/components/dashboard/SalesMixChart";
import { Stat } from "@/components/ui/Stat";
import { formatMoney } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const { data, loading, error, reload } = useApiData<DashboardData>("/api/dashboard");
  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error || !data) return <ErrorState message={error || "Failed to load dashboard"} onRetry={reload} />;
  const { stats, salesTrend = [], alerts = [], recentSales = [], moduleRoadmap = [] } = data;

  return (
    <div>
      <PageHeader
        eyebrow="U-niche Perfumes"
        title="Operations Dashboard"
        description="Live operating metrics for retail, remix, inventory health, and module readiness."
        actions={
          <>
            <Link href="/pos">
              <Button variant="gold">
                Open POS
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/playground">
              <Button variant="secondary">Feature Map</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Today's Sales"
          value={formatMoney(stats.todaySales)}
          hint="completed today"
          delay="stagger-1"
        />
        <Stat
          label="Gross Margin"
          value={`${stats.grossMarginPct}%`}
          hint="FIFO-based"
          delay="stagger-2"
        />
        <Stat
          label="Remix Sales"
          value={String(stats.remixSales)}
          hint="auto BOM deducted"
          delay="stagger-3"
        />
        <Link
          href="/inventory"
          className="block rounded-[var(--radius)] transition hover:ring-2 hover:ring-gold/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Stat
            label="Inventory Value"
            value={formatMoney(stats.fifoValue)}
            hint="FIFO sellable →"
            delay="stagger-4"
            className="h-full"
          />
        </Link>
        <Link
          href="/inventory/low-stock"
          className="block rounded-[var(--radius)] transition hover:ring-2 hover:ring-gold/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Stat
            label="Low Stock SKUs"
            value={String(stats.lowStockCount)}
            trend={stats.lowStockCount > 0 ? "Action needed" : undefined}
            trendUp={false}
            hint="View all →"
            delay="stagger-5"
            className="h-full"
          />
        </Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="animate-fade-up xl:col-span-2">
          <PanelHeader
            title="Weekly Sales Mix"
            subtitle="Retail · Wholesale · Remix"
            action={<Badge tone="info">Live</Badge>}
          />
          <SalesMixChart data={salesTrend} />
        </Panel>

        <Panel className="animate-fade-up">
          <PanelHeader
            title="Alerts"
            subtitle="Stock & reports"
            action={
              <div className="flex items-center gap-2">
                <Link
                  href="/inventory/low-stock"
                  className="text-xs font-medium text-gold-deep hover:underline"
                >
                  Low stock →
                </Link>
                <Badge tone="danger">
                  <AlertTriangle className="h-3 w-3" />
                  {alerts.length}
                </Badge>
              </div>
            }
          />
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="rounded-2xl border border-line/70 bg-mist/80 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{alert.title}</p>
                  <Badge
                    tone={
                      alert.severity === "critical"
                        ? "danger"
                        : alert.severity === "warning"
                          ? "warning"
                          : "info"
                    }
                  >
                    {alert.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{alert.detail}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="animate-fade-up" padding={false}>
          <div className="border-b border-line/70 px-5 py-4">
            <PanelHeader
              title="Recent Sales"
              subtitle="Today at Main Store"
              action={
                <Link href="/pos">
                  <Button size="sm" variant="ghost">
                    POS
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-mist/60 text-[11px] uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Pay</th>
                  <th className="px-5 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
            {recentSales.map((sale) => (
                  <tr key={sale.id} className="border-t border-line/60">
                    <td className="px-5 py-3 text-ink-muted">{sale.time}</td>
                    <td className="px-3 py-3 font-medium">{sale.customer}</td>
                    <td className="px-3 py-3">
                      <Badge tone="neutral">{sale.type}</Badge>
                    </td>
                    <td className="px-3 py-3 text-ink-muted">{sale.payment}</td>
                    <td className="px-5 py-3 text-right font-medium">
                      {formatMoney(sale.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="animate-fade-up">
          <PanelHeader
            title="Phase 1 Roadmap"
            subtitle="Build order for the prototype"
            action={
              <Badge tone="gold">
                <Sparkles className="h-3 w-3" />
                Playground
              </Badge>
            }
          />
          <ul className="space-y-2">
            {moduleRoadmap.map((mod) => (
              <li
                key={mod.name}
                className="flex items-center justify-between rounded-2xl border border-line/60 bg-mist/80 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-canvas">
                    {mod.priority}
                  </span>
                  <span className="text-sm font-medium">{mod.name}</span>
                </div>
                <Badge
                  tone={
                    mod.status === "prototype"
                      ? "success"
                      : mod.status === "shell"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {mod.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

    </div>
  );
}

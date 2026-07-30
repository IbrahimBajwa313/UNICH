"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { formatMoney } from "@/lib/format";
import type { DashboardData, Product, Supplier } from "@/lib/types";

export default function ReportsPage() {
  const dashboard = useApiData<DashboardData>("/api/dashboard");
  const products = useApiData<Product[]>("/api/products");
  const suppliers = useApiData<Supplier[]>("/api/suppliers");
  if (dashboard.loading || products.loading || suppliers.loading) return <LoadingState label="Loading reports…" />;
  if (dashboard.error || products.error || suppliers.error) return <ErrorState message={dashboard.error || products.error || suppliers.error || "Failed to load reports"} onRetry={() => { void dashboard.reload(); void products.reload(); void suppliers.reload(); }} />;
  const productList = products.data ?? [];
  const supplierList = suppliers.data ?? [];
  const stats = dashboard.data?.stats;
  const lowStock = productList.filter(
    (p) => p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt,
  );
  const deadStock = dashboard.data?.alerts?.filter((a) => a.type === "dead_stock") ?? [];
  const weekTotal = stats?.weekTotal ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Reports & Dashboards"
        description="Daily, weekly, and monthly sales · FIFO valuation · dead & low stock · margins · customer and supplier history. Email & WhatsApp delivery planned."
        actions={
          <>
            <Button variant="secondary" size="sm">
              Weekly PDF
            </Button>
            <Button variant="gold" size="sm">
              Monthly Pack
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Week Sales" value={formatMoney(weekTotal)} trend="+12%" trendUp />
        <Stat label="Gross Profit Est." value={formatMoney(weekTotal * ((stats?.grossMarginPct ?? 0) / 100))} hint="FIFO" />
        <Stat label="Low Stock SKUs" value={String(lowStock.length)} />
        <Stat label="Dead Stock Flags" value={String(deadStock.length)} hint=">30 days" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <ReportCard
          title="Sales Reports"
          items={["Daily closing", "Weekly mix", "Monthly summary", "Remix vs retail"]}
        />
        <ReportCard
          title="Inventory Reports"
          items={["Current stock", "FIFO valuation", "Low stock", "Dead stock >30d"]}
        />
        <ReportCard
          title="Financial Reports"
          items={["Profit by SKU", "Margin alerts", "Sales summary", "Credit outstanding"]}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Low Stock Snapshot" subtitle="Alert thresholds applied" />
          <ul className="space-y-2">
            {lowStock.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-line/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{p.name}</span>
                <Badge tone="danger">
                  {p.stockSellable} / {p.lowStockAt} {p.unit}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Supplier Pricing Watch" subtitle="Compare latest layers" />
          <ul className="space-y-2">
            {supplierList.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-line/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-ink-muted">{s.currency}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function ReportCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Panel>
      <h3 className="font-semibold text-lg text-ink">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 text-sm text-ink-muted"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {item}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

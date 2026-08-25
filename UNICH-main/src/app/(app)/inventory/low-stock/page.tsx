"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Filter, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { clsx, formatMoney, formatQty } from "@/lib/format";
import type { Product } from "@/lib/types";

const emptyProducts: Product[] = [];

type LowRow = Product & {
  gap: number;
  valueAtRisk: number;
  severity: "critical" | "warning";
};

export default function LowStockPage() {
  const { data: products, loading, error, reload } =
    useApiData<Product[]>("/api/products");
  const [category, setCategory] = useState("All");
  const [brand, setBrand] = useState("All");
  const [selectedId, setSelectedId] = useState("");

  const inventory = products ?? emptyProducts;

  const lowRows = useMemo(() => {
    const rows: LowRow[] = inventory
      .filter((p) => p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt)
      .map((p) => {
        const gap = p.lowStockAt - p.stockSellable;
        return {
          ...p,
          gap,
          valueAtRisk: Math.max(0, gap) * (Number(p.costFifo) || 0),
          severity: p.stockSellable <= 0 ? ("critical" as const) : ("warning" as const),
        };
      })
      .sort((a, b) => {
        if (a.severity !== b.severity) {
          return a.severity === "critical" ? -1 : 1;
        }
        return b.gap - a.gap;
      });
    return rows;
  }, [inventory]);

  const categories = useMemo(() => {
    const set = new Set(lowRows.map((p) => p.category));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [lowRows]);

  const brands = useMemo(() => {
    const set = new Set(
      lowRows.map((p) => (p.brand || "").trim()).filter(Boolean),
    );
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [lowRows]);

  const filtered = useMemo(() => {
    return lowRows.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (brand !== "All") {
        const b = (p.brand || "").trim();
        if (!b || b.toLowerCase() !== brand.toLowerCase()) return false;
      }
      return true;
    });
  }, [brand, category, lowRows]);

  const criticalCount = filtered.filter((p) => p.severity === "critical").length;
  const valueAtRisk = filtered.reduce((s, p) => s + p.valueAtRisk, 0);
  const active =
    filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  if (loading) return <LoadingState label="Loading low stock…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Low Stock"
        description="Products at or below their sellable threshold — restock or adjust before stockouts hit POS."
        actions={
          <Link href="/inventory">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to inventory
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Low Stock SKUs"
          value={String(filtered.length)}
          hint={
            category !== "All" || brand !== "All"
              ? `${lowRows.length} total across catalogue`
              : "Sellable vs threshold"
          }
          trend={filtered.length > 0 ? "Action needed" : "Healthy"}
          trendUp={filtered.length === 0}
        />
        <Stat
          label="Out of Stock"
          value={String(criticalCount)}
          hint="Zero sellable units"
          trend={criticalCount > 0 ? "Critical" : undefined}
          trendUp={false}
        />
        <Stat
          label="Value at Risk"
          value={formatMoney(valueAtRisk)}
          hint="Gap × FIFO cost"
        />
        <Stat
          label="Categories Hit"
          value={String(
            new Set(filtered.map((p) => p.category)).size,
          )}
          hint="Needing attention"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-ink-muted" />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSelectedId("");
          }}
          className="h-9 rounded-lg border border-line bg-mist px-2 text-sm outline-none focus:border-gold"
          aria-label="Filter by category"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "All" ? "All categories" : c}
            </option>
          ))}
        </select>
        <select
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value);
            setSelectedId("");
          }}
          className="h-9 rounded-lg border border-line bg-mist px-2 text-sm outline-none focus:border-gold"
          aria-label="Filter by brand"
        >
          {brands.map((b) => (
            <option key={b} value={b}>
              {b === "All" ? "All brands" : b}
            </option>
          ))}
        </select>
        {(category !== "All" || brand !== "All") && (
          <button
            type="button"
            onClick={() => {
              setCategory("All");
              setBrand("All");
              setSelectedId("");
            }}
            className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {lowRows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="All stock levels healthy"
          detail="No products are at or below their low-stock threshold right now."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No matches"
          detail="Try another category or brand filter."
        />
      ) : (
        <div className="mt-4 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Panel padding={false}>
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Products below threshold
                </p>
                <p className="text-xs text-ink-muted">
                  Critical (0 stock) listed first · click a row for details
                </p>
              </div>
              <Badge tone={criticalCount > 0 ? "danger" : "warning"}>
                <AlertTriangle className="h-3 w-3" />
                {filtered.length}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">SKU / Product</th>
                    <th className="px-3 py-3 font-medium">Category</th>
                    <th className="px-3 py-3 font-medium">On hand</th>
                    <th className="px-3 py-3 font-medium">Threshold</th>
                    <th className="px-3 py-3 font-medium">Gap</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Value at risk
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={clsx(
                        "cursor-pointer border-t border-line/60 transition hover:bg-mist/50",
                        active?.id === p.id ? "bg-gold/10" : "",
                      )}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-start gap-2">
                          <span
                            className={clsx(
                              "mt-1 h-2 w-2 shrink-0 rounded-full",
                              p.severity === "critical"
                                ? "bg-coral"
                                : "bg-amber",
                            )}
                          />
                          <div>
                            <p className="font-medium text-ink">{p.name}</p>
                            <p className="text-[11px] text-ink-muted">
                              {p.sku}
                              {p.brand ? ` · ${p.brand}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{p.category}</td>
                      <td className="px-3 py-3">
                        <Badge
                          tone={p.severity === "critical" ? "danger" : "warning"}
                        >
                          {formatQty(p.stockSellable, p.unit)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {formatQty(p.lowStockAt, p.unit)}
                      </td>
                      <td className="px-3 py-3 font-medium text-coral">
                        −{formatQty(p.gap, p.unit)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium">
                        {formatMoney(p.valueAtRisk)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="space-y-5">
            {active ? (
              <Panel>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                      Selected SKU
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-ink">
                      {active.name}
                    </h2>
                    <p className="text-sm text-ink-muted">
                      {active.sku} · {active.category}
                    </p>
                  </div>
                  <Badge
                    tone={active.severity === "critical" ? "danger" : "warning"}
                  >
                    {active.severity === "critical" ? "Out of stock" : "Low"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Meta
                    label="On hand"
                    value={formatQty(active.stockSellable, active.unit)}
                  />
                  <Meta
                    label="Threshold"
                    value={formatQty(active.lowStockAt, active.unit)}
                  />
                  <Meta
                    label="Gap to fill"
                    value={formatQty(active.gap, active.unit)}
                  />
                  <Meta
                    label="FIFO cost"
                    value={formatMoney(active.costFifo)}
                  />
                  <Meta
                    label="Value at risk"
                    value={formatMoney(active.valueAtRisk)}
                  />
                  <Meta
                    label="Other buckets"
                    value={`${formatQty(active.stockTester, active.unit)} T · ${formatQty(active.stockSample, active.unit)} S`}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/inventory">
                    <Button size="sm" variant="gold">
                      <PackageSearch className="h-4 w-4" />
                      Open in inventory
                    </Button>
                  </Link>
                  <Link href="/purchases">
                    <Button size="sm" variant="secondary">
                      Go to purchasing
                    </Button>
                  </Link>
                </div>
                <p className="mt-3 text-xs text-ink-muted">
                  Adjust sellable stock or raise a purchase for{" "}
                  <span className="font-medium text-ink">
                    {formatQty(active.gap, active.unit)}
                  </span>{" "}
                  to clear this alert.
                </p>
              </Panel>
            ) : null}

            <Panel>
              <p className="text-sm font-semibold text-ink">How alerts work</p>
              <ul className="mt-2 space-y-2 text-sm text-ink-muted">
                <li>
                  A product is low when{" "}
                  <span className="text-ink">sellable ≤ low-stock threshold</span>.
                </li>
                <li>
                  <span className="text-ink">Out of stock</span> means sellable is
                  zero — shown first in red.
                </li>
                <li>
                  Value at risk estimates FIFO cost to refill the gap to threshold.
                </li>
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}

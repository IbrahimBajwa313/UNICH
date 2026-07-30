"use client";

import { useMemo, useState } from "react";
import { Download, Upload, Filter } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney, formatQty } from "@/lib/format";
import type { FifoLayer, Product, StockBucket } from "@/lib/types";

const buckets: { id: StockBucket | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sellable", label: "Sellable" },
  { id: "tester", label: "Testers" },
  { id: "sample", label: "Samples" },
  { id: "personal", label: "Personal" },
];
const emptyProducts: Product[] = [];

export default function InventoryPage() {
  const { data: products, loading, error, reload, setData: setProducts } = useApiData<Product[]>("/api/products");
  const [bucket, setBucket] = useState<StockBucket | "all">("sellable");
  const [selected, setSelected] = useState("");
  const [category, setCategory] = useState("All");
  const [saving, setSaving] = useState(false);
  const activeId = selected || products?.[0]?.id || "";
  const { data: layers, loading: layersLoading } = useApiData<FifoLayer[]>(
    activeId ? `/api/fifo-layers?productId=${activeId}` : null,
  );
  const inventory = products ?? emptyProducts;

  const categories = ["All", ...Array.from(new Set(inventory.map((p) => p.category)))];

  const rows = useMemo(() => {
    return inventory.filter((p) => category === "All" || p.category === category);
  }, [category, inventory]);

  const selectedProduct = inventory.find((p) => p.id === activeId);
  const fifoValue = inventory.reduce(
    (s, p) => s + p.stockSellable * p.costFifo,
    0,
  );
  const lowCount = inventory.filter(
    (p) => p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt,
  ).length;

  function stockFor(p: Product) {
    if (bucket === "tester") return p.stockTester;
    if (bucket === "sample") return p.stockSample;
    if (bucket === "personal") return p.stockPersonal;
    return p.stockSellable;
  }
  async function saveStock() {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      await api(`/api/products/${selectedProduct.id}`, {
        method: "PUT",
        body: JSON.stringify({
          stockSellable: selectedProduct.stockSellable,
          stockTester: selectedProduct.stockTester,
          stockSample: selectedProduct.stockSample,
          stockPersonal: selectedProduct.stockPersonal,
          lowStockAt: selectedProduct.lowStockAt,
        }),
      });
      await reload();
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <LoadingState label="Loading inventory…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!selectedProduct) return <LoadingState label="Preparing inventory…" />;

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Stock & FIFO Valuation"
        description="Separate buckets for sellable, testers, samples, and personal use. Purchase layers drive FIFO costing and profit."
        actions={
          <>
            <Button variant="secondary" size="sm">
              <Upload className="h-4 w-4" />
              Import Excel
            </Button>
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="SKUs Tracked" value={String(inventory.length)} hint="~700 at go-live" />
        <Stat label="FIFO Stock Value" value={formatMoney(fifoValue)} hint="Sellable only" />
        <Stat label="Low Stock Alerts" value={String(lowCount)} trend="Review" trendUp={false} />
        <Stat
          label="Unit Precision"
          value="3 dp"
          hint="ml · tola conversions"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {buckets.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBucket(b.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              bucket === b.id
                ? "bg-ink text-canvas"
                : "border border-line bg-mist text-ink-muted hover:text-ink"
            }`}
          >
            {b.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-muted" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-lg border border-line bg-mist px-2 text-sm outline-none focus:border-gold"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Panel padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">SKU / Product</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Qty</th>
                  <th className="px-3 py-3 font-medium">FIFO Cost</th>
                  <th className="px-5 py-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const qty = stockFor(p);
                  const low =
                    bucket === "sellable" &&
                    p.lowStockAt > 0 &&
                    p.stockSellable <= p.lowStockAt;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className={`cursor-pointer border-t border-line/60 transition hover:bg-mist/50 ${
                        activeId === p.id ? "bg-gold/10" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-[11px] text-ink-muted">{p.sku}</p>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{p.category}</td>
                      <td className="px-3 py-3">
                        <Badge tone={low ? "danger" : "neutral"}>
                          {formatQty(qty, p.unit)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">{formatMoney(p.costFifo)}</td>
                      <td className="px-5 py-3 text-right font-medium">
                        {formatMoney(qty * p.costFifo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader
              title={selectedProduct.name}
              subtitle={`${selectedProduct.sku} · FIFO layers`}
              action={<Badge tone="gold">Admin</Badge>}
            />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Meta label="Sellable" value={formatQty(selectedProduct.stockSellable, selectedProduct.unit)} />
              <Meta label="Testers" value={formatQty(selectedProduct.stockTester, selectedProduct.unit)} />
              <Meta label="Samples" value={formatQty(selectedProduct.stockSample, selectedProduct.unit)} />
              <Meta label="Personal" value={formatQty(selectedProduct.stockPersonal, selectedProduct.unit)} />
              <Meta label="Low at" value={formatQty(selectedProduct.lowStockAt, selectedProduct.unit)} />
              <Meta label="Avg FIFO" value={formatMoney(selectedProduct.costFifo)} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["stockSellable", "stockTester", "stockSample", "stockPersonal", "lowStockAt"] as const).map((field) => (
                <label key={field} className="text-xs text-ink-muted">
                  {field.replace("stock", "").replace(/([A-Z])/g, " $1")}
                  <input
                    type="number"
                    value={selectedProduct[field]}
                    onChange={(e) => {
                      setProducts(inventory.map((p) => p.id === selectedProduct.id ? { ...p, [field]: Number(e.target.value) } : p));
                    }}
                    className="mt-1 h-8 w-full rounded border border-line bg-mist px-2 text-sm"
                  />
                </label>
              ))}
            </div>
            <Button className="mt-3" size="sm" onClick={saveStock} disabled={saving}>
              {saving ? "Saving…" : "Save stock fields"}
            </Button>
          </Panel>

          <Panel>
            <PanelHeader
              title="FIFO Cost Layers"
              subtitle="Oldest layer consumed first on sale"
            />
            {layersLoading ? <LoadingState label="Loading layers…" /> : !layers?.length ? (
              <p className="text-sm text-ink-muted">
                No purchase layers recorded for this SKU.
              </p>
            ) : (
              <ul className="space-y-2">
                {layers.map((layer, idx) => (
                  <li
                    key={layer.id}
                    className="rounded-lg border border-line/70 bg-mist/30 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-canvas">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{layer.supplierName}</p>
                          <p className="text-[11px] text-ink-muted">
                            {layer.purchaseDate} · {layer.currency}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatMoney(layer.unitCost)}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {formatQty(layer.qtyRemaining, selectedProduct.unit)} left
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 rounded-lg border border-dashed border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold-deep">
              Conversion: 1 Tola = 12 ml · ½ = 6 ml · ¼ = 3 ml
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

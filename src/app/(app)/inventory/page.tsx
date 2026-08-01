"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Upload, Filter, X, FileSpreadsheet, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney, formatQty } from "@/lib/format";
import type { FifoLayer, ImportBatchSummary, Product, StockBucket } from "@/lib/types";

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
  const [importOpen, setImportOpen] = useState(false);
  const [staging, setStaging] = useState<ImportBatchSummary | null>(null);
  const [stageBusy, setStageBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);
  const [safeMode, setSafeMode] = useState(true);
  const [adminPassword, setAdminPassword] = useState("");
  const [lastCommittedBatchId, setLastCommittedBatchId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }

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

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTemplate() {
    const res = await fetch("/api/products/import/template");
    if (!res.ok) throw new Error("Could not download template");
    downloadBlob(await res.blob(), "unich-product-import-template.xlsx");
  }

  async function exportCatalogue() {
    try {
      const res = await fetch("/api/products/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      downloadBlob(await res.blob(), "unich-product-catalogue.xlsx");
      flash("Catalogue exported");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setStageBusy(true);
    setStaging(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/products/import/stage", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Staging failed");
      setStaging(data as ImportBatchSummary);
      setAdminOverride(false);
      setAdminPassword("");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Staging failed");
    } finally {
      setStageBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function commitImport() {
    if (!staging) return;
    setCommitBusy(true);
    try {
      const result = await api<{
        batchId: string;
        created: number;
        updated: number;
        failed: number;
      }>("/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify({
          batchId: staging.batchId,
          adminOverride,
          strictMode: safeMode,
          adminPassword: adminOverride ? adminPassword : undefined,
        }),
      });
      setLastCommittedBatchId(result.batchId);
      flash(
        `Import committed · ${result.created} created · ${result.updated} updated · ${result.failed} skipped`,
      );
      setImportOpen(false);
      setStaging(null);
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setCommitBusy(false);
    }
  }

  async function downloadErrors() {
    if (!staging) return;
    const res = await fetch(`/api/products/import/${staging.batchId}/errors`);
    if (!res.ok) {
      flash("Could not download error report");
      return;
    }
    downloadBlob(await res.blob(), `import-errors-${staging.batchId}.xlsx`);
  }

  async function undoLastImport() {
    if (!lastCommittedBatchId) return;
    setUndoBusy(true);
    try {
      await api(`/api/products/import/${lastCommittedBatchId}/undo`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      flash(`Undid import ${lastCommittedBatchId}`);
      setLastCommittedBatchId(null);
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setUndoBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading inventory…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!selectedProduct) return <LoadingState label="Preparing inventory…" />;

  const errorRows = staging?.rows.filter((r) => r.action === "error") ?? [];
  const hasWritable =
    Boolean(staging && (staging.created > 0 || staging.updated > 0)) ||
    Boolean(staging && adminOverride && staging.priceFloorCount > 0 && adminPassword);
  const strictBlocked = Boolean(safeMode && staging && staging.failed > 0);

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Stock & FIFO Valuation"
        description="Separate buckets for sellable, testers, samples, and personal use. Purchase layers drive FIFO costing and profit."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCatalogue()}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            {lastCommittedBatchId ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={undoBusy}
                onClick={() => void undoLastImport()}
              >
                <Undo2 className="h-4 w-4" />
                {undoBusy ? "Undoing…" : "Undo last import"}
              </Button>
            ) : null}
          </>
        }
      />

      {toast ? (
        <div className="mb-4 rounded-lg border border-sage/30 bg-sage-soft px-4 py-2 text-sm text-sage">
          {toast}
        </div>
      ) : null}

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

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-paper shadow-xl">
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                  Catalogue import
                </p>
                <h2 className="mt-1 font-semibold text-xl text-ink">Excel Import</h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-ink-muted hover:bg-mist hover:text-ink"
                onClick={() => {
                  setImportOpen(false);
                  setStaging(null);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void downloadTemplate().catch((e) => flash(e.message))}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  1) Download Template
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  disabled={stageBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {stageBusy ? "Checking File…" : "2) Upload File"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => void onFileSelected(e.target.files?.[0] || null)}
                />
              </div>

              {staging ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat label="Rows in file" value={String(staging.total)} />
                    <MiniStat label="New products" value={String(staging.created)} />
                    <MiniStat label="Products to update" value={String(staging.updated)} />
                    <MiniStat label="Rows to fix" value={String(staging.failed)} />
                  </div>

                  {staging.priceFloorCount > 0 ? (
                    <div className="rounded-lg border border-line bg-mist/50 px-3 py-3 text-sm">
                      <p className="font-medium text-ink">
                        {staging.priceFloorCount} row needs admin price approval
                      </p>
                      <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          checked={adminOverride}
                          onChange={(e) => setAdminOverride(e.target.checked)}
                        />
                        Allow admin price exception (password)
                      </label>
                      {adminOverride ? (
                        <input
                          type="password"
                          placeholder="Admin password"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="mt-2 h-9 w-full rounded border border-line bg-paper px-2 text-sm"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {errorRows.length > 0 ? (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">Rows needing fix</p>
                        <Button size="sm" variant="secondary" onClick={() => void downloadErrors()}>
                          Download Fix File
                        </Button>
                      </div>
                      <p className="mb-2 text-xs text-ink-muted">
                        Fix these rows and upload the file again.
                      </p>
                      <div className="max-h-48 overflow-auto rounded-lg border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-mist/70 text-ink-muted">
                            <tr>
                              <th className="px-3 py-2">Row</th>
                              <th className="px-3 py-2">Product Code</th>
                              <th className="px-3 py-2">What to fix</th>
                            </tr>
                          </thead>
                          <tbody>
                            {errorRows.map((r) => (
                              <tr key={r.rowNumber} className="border-t border-line/60">
                                <td className="px-3 py-2">{r.rowNumber}</td>
                                <td className="px-3 py-2">{r.sku || "—"}</td>
                                <td className="px-3 py-2 text-ink-muted">{r.errorReason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-sage">All rows passed validation.</p>
                  )}

                  <div className="rounded-lg border border-line bg-mist/50 px-3 py-3 text-sm">
                    <label className="flex items-center gap-2 text-ink">
                      <input
                        type="checkbox"
                        checked={safeMode}
                        onChange={(e) => setSafeMode(e.target.checked)}
                      />
                      Safe Mode (Stop if any error)
                    </label>
                    <p className="mt-1 text-xs text-ink-muted">
                      On: import stops if any row has an issue. Off: good rows import, bad rows skip.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-line/70 pt-4">
                    <Button
                      variant="gold"
                      disabled={commitBusy || !hasWritable || strictBlocked}
                      onClick={() => void commitImport()}
                    >
                      {commitBusy ? "Importing…" : "Import Now"}
                    </Button>
                    {strictBlocked ? (
                      <Button
                        variant="secondary"
                        onClick={() => void downloadErrors()}
                      >
                        Fix File & Re-upload
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setStaging(null);
                        setAdminOverride(false);
                        setAdminPassword("");
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    Batch {staging.batchId} · {safeMode ? "Safe Mode is ON: fix all rows first." : "Safe Mode is OFF: valid rows will import."}
                  </p>
                </>
              ) : (
                <p className="text-sm text-ink-muted">
                  Download the flat template, fill one product per row, then upload for a dry-run
                  preview before anything hits the database.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

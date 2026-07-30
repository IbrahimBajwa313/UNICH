"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { api } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import type { PurchaseOrder, Supplier } from "@/lib/types";

const statusTone = {
  draft: "neutral",
  ordered: "info",
  received: "success",
  partial: "warning",
} as const;

export default function PurchasesPage() {
  const { data: purchases, loading, error, reload } = useApiData<PurchaseOrder[]>("/api/purchases");
  const { data: suppliers, loading: suppliersLoading, error: suppliersError, reload: reloadSuppliers } = useApiData<Supplier[]>("/api/suppliers");
  const [purchaseDraft, setPurchaseDraft] = useState<Record<string, string> | null>(null);
  const [supplierDraft, setSupplierDraft] = useState<Record<string, string> | null>(null);
  const purchaseList = purchases ?? [];
  const supplierList = suppliers ?? [];
  const outstanding = supplierList.reduce((s, x) => s + x.outstanding, 0);
  async function savePurchase() {
    if (!purchaseDraft?.supplierId) return;
    const supplier = supplierList.find((s) => s.id === purchaseDraft.supplierId);
    if (!supplier) return;
    await api("/api/purchases", { method: "POST", body: JSON.stringify({ ...purchaseDraft, supplierName: supplier.name, currency: purchaseDraft.currency || supplier.currency, total: Number(purchaseDraft.total || 0), itemCount: Number(purchaseDraft.itemCount || 0) }) });
    setPurchaseDraft(null); await reload();
  }
  async function saveSupplier() {
    if (!supplierDraft?.name || !supplierDraft.phone) return;
    await api("/api/suppliers", { method: "POST", body: JSON.stringify({ ...supplierDraft, creditLimit: Number(supplierDraft.creditLimit || 0), outstanding: 0, avgLeadDays: Number(supplierDraft.avgLeadDays || 0) }) });
    setSupplierDraft(null); await reloadSuppliers();
  }
  if (loading || suppliersLoading) return <LoadingState label="Loading purchasing data…" />;
  if (error || suppliersError) return <ErrorState message={error || suppliersError || "Failed to load purchasing data"} onRetry={() => { void reload(); void reloadSuppliers(); }} />;

  return (
    <div>
      <PageHeader
        eyebrow="Supply Chain"
        title="Purchasing & Suppliers"
        description="Supplier-based purchasing with multi-currency support, credit tracking, and FIFO layer creation on goods receipt. No auto PO — suppliers change often."
        actions={<div className="flex gap-2"><Button variant="secondary" onClick={() => setSupplierDraft({ currency: "AED" })}>Add Supplier</Button><Button variant="gold" onClick={() => setPurchaseDraft({ currency: "AED", status: "draft" })}>New Purchase</Button></div>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active Suppliers" value={String(supplierList.length)} />
        <Stat label="Open Payables" value={formatMoney(outstanding)} />
        <Stat label="POs This Month" value={String(purchaseList.length)} />
        <Stat label="Currencies" value="AED · USD" hint="Multi-currency ready" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Panel padding={false}>
          <div className="border-b border-line/70 px-5 py-4">
            <PanelHeader title="Recent Purchases" subtitle="Creates FIFO cost layers on receipt" />
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Supplier</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseList.map((po) => (
                <tr key={po.id} className="border-t border-line/60">
                  <td className="px-5 py-3 text-ink-muted">{formatDate(po.date)}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{po.supplierName}</p>
                    <p className="text-[11px] text-ink-muted">
                      {po.itemCount} lines · {po.currency}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={statusTone[po.status]}>{po.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
                    {formatMoney(po.total, po.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel padding={false}>
          <div className="border-b border-line/70 px-5 py-4">
            <PanelHeader
              title="Supplier Directory"
              subtitle="Price history & credit"
            />
          </div>
          <ul className="divide-y divide-line/60">
            {supplierList.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-ink-muted">
                    {s.phone} · Lead {s.avgLeadDays}d · Last {formatDate(s.lastPurchase)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatMoney(s.outstanding, s.currency)}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    of {formatMoney(s.creditLimit, s.currency)} limit
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {purchaseDraft ? <Panel className="mt-5"><PanelHeader title="New Purchase" subtitle="Create a purchase order" /><div className="grid gap-3 sm:grid-cols-4"><label>Supplier<select value={purchaseDraft.supplierId || ""} onChange={(e) => setPurchaseDraft({ ...purchaseDraft, supplierId: e.target.value })} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2"><option value="">Select supplier</option>{supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><Field label="Total" value={purchaseDraft.total || ""} onChange={(total) => setPurchaseDraft({ ...purchaseDraft, total })} /><Field label="Item count" value={purchaseDraft.itemCount || ""} onChange={(itemCount) => setPurchaseDraft({ ...purchaseDraft, itemCount })} /><label>Status<select value={purchaseDraft.status || "draft"} onChange={(e) => setPurchaseDraft({ ...purchaseDraft, status: e.target.value })} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2"><option>draft</option><option>ordered</option><option>received</option><option>partial</option></select></label></div><div className="mt-3 flex gap-2"><Button onClick={savePurchase}>Save Purchase</Button><Button variant="secondary" onClick={() => setPurchaseDraft(null)}>Cancel</Button></div></Panel> : null}
      {supplierDraft ? <Panel className="mt-5"><PanelHeader title="New Supplier" subtitle="Add a supplier directory entry" /><div className="grid gap-3 sm:grid-cols-4"><Field label="Name" value={supplierDraft.name || ""} onChange={(name) => setSupplierDraft({ ...supplierDraft, name })} /><Field label="Phone" value={supplierDraft.phone || ""} onChange={(phone) => setSupplierDraft({ ...supplierDraft, phone })} /><Field label="Currency" value={supplierDraft.currency || "AED"} onChange={(currency) => setSupplierDraft({ ...supplierDraft, currency })} /><Field label="Credit limit" value={supplierDraft.creditLimit || ""} onChange={(creditLimit) => setSupplierDraft({ ...supplierDraft, creditLimit })} /></div><div className="mt-3 flex gap-2"><Button onClick={saveSupplier}>Save Supplier</Button><Button variant="secondary" onClick={() => setSupplierDraft(null)}>Cancel</Button></div></Panel> : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-ink-muted">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm" /></label>; }

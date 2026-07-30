"use client";

import { useState } from "react";
import { FileDown, MessageCircle, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import type { Quotation, QuotationStatus } from "@/lib/types";

const statuses: QuotationStatus[] = [
  "draft",
  "sent",
  "revised",
  "approved",
  "rejected",
  "expired",
];

export default function QuotationsPage() {
  const [filter, setFilter] = useState<QuotationStatus | "all">("all");
  const [toast, setToast] = useState<string | null>(null);
  const { data: quotations, loading, error, reload } = useApiData<Quotation[]>(`/api/quotations?status=${filter}`);
  const [draft, setDraft] = useState<Partial<Quotation> | null>(null);
  const rows = quotations ?? [];

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }
  async function setStatus(id: string, status: QuotationStatus) {
    try { await api(`/api/quotations/${id}`, { method: "PUT", body: JSON.stringify({ status }) }); await reload(); }
    catch (err) { flash(err instanceof Error ? err.message : "Could not update quotation"); }
  }
  async function convert(id: string) {
    try { await api(`/api/quotations/${id}`, { method: "POST", body: JSON.stringify({ action: "convert" }) }); flash("Converted to sale"); await reload(); }
    catch (err) { flash(err instanceof Error ? err.message : "Could not convert quotation"); }
  }
  async function saveQuote() {
    if (!draft?.customerName || !draft.customerPhone) return;
    try { await api("/api/quotations", { method: "POST", body: JSON.stringify({ ...draft, total: Number(draft.total || 0), items: Number(draft.items || 0) }) }); setDraft(null); await reload(); }
    catch (err) { flash(err instanceof Error ? err.message : "Could not create quotation"); }
  }
  if (loading) return <LoadingState label="Loading quotations…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Sales Pipeline"
        title="Quotations"
        description="Draft → sent → revised → approved. Convert directly to sales order, invoice, or receipt without re-entry. PDF & WhatsApp sharing."
        actions={<Button variant="gold" onClick={() => setDraft({ status: "draft", items: 1, total: 0 })}>New Quotation</Button>}
      />

      {toast ? (
        <div className="mb-4 rounded-lg border border-sage/30 bg-sage-soft px-4 py-2 text-sm text-sage">
          {toast}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
            filter === "all" ? "bg-ink text-canvas" : "border border-line bg-mist text-ink-muted"
          }`}
        >
          All
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize ${
              filter === s ? "bg-ink text-canvas" : "border border-line bg-mist text-ink-muted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Panel padding={false}>
        <table className="w-full text-left text-sm">
          <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Number</th>
              <th className="px-3 py-3 font-medium">Customer</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">Expiry</th>
              <th className="px-3 py-3 text-right font-medium">Total</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id} className="border-t border-line/60">
                <td className="px-5 py-3 font-medium">{q.number}</td>
                <td className="px-3 py-3">
                  <p>{q.customerName}</p>
                  <p className="text-[11px] text-ink-muted">{q.customerPhone}</p>
                </td>
                <td className="px-3 py-3">
                  <select value={q.status} onChange={(e) => void setStatus(q.id, e.target.value as QuotationStatus)} className="rounded border border-line bg-mist px-2 py-1 text-xs"><option value={q.status}>{q.status}</option>{statuses.filter((status) => status !== q.status).map((status) => <option key={status} value={status}>{status}</option>)}</select>
                </td>
                <td className="px-3 py-3 text-ink-muted">{formatDate(q.date)}</td>
                <td className="px-3 py-3 text-ink-muted">{formatDate(q.expiry)}</td>
                <td className="px-3 py-3 text-right font-medium">
                  {formatMoney(q.total)}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => flash("PDF generated")}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => flash("Shared via WhatsApp")}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                    {q.status === "approved" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void convert(q.id)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Convert
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {draft ? <Panel className="mt-5"><div className="grid gap-3 sm:grid-cols-4"><QuoteInput label="Customer name" value={draft.customerName || ""} onChange={(customerName) => setDraft({ ...draft, customerName })} /><QuoteInput label="Customer phone" value={draft.customerPhone || ""} onChange={(customerPhone) => setDraft({ ...draft, customerPhone })} /><QuoteInput label="Total" value={String(draft.total || "")} onChange={(value) => setDraft({ ...draft, total: Number(value) })} /><QuoteInput label="Items" value={String(draft.items || "")} onChange={(value) => setDraft({ ...draft, items: Number(value) })} /></div><div className="mt-3 flex gap-2"><Button onClick={saveQuote}>Create Quotation</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div></Panel> : null}
    </div>
  );
}

function QuoteInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-ink-muted">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm" /></label>; }

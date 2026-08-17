"use client";

import { useRef, useState } from "react";
import { FileDown, MessageCircle, ArrowRightLeft, Pencil, History, Link as LinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { QuotationEditor } from "@/components/quotations/QuotationEditor";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import { printHtmlDocument, fetchReceiptHtml } from "@/lib/receipt/print";
import {
  buildWhatsAppUrl,
  formatQuotationMessage,
} from "@/lib/notifications/whatsapp";
import type { AppSettings, Product, Quotation, QuotationStatus } from "@/lib/types";

const statuses: QuotationStatus[] = [
  "draft",
  "sent",
  "revised",
  "approved",
  "rejected",
  "expired",
  "converted",
];

const statusTone: Record<QuotationStatus, "neutral" | "success" | "warning" | "danger" | "gold" | "info"> = {
  draft: "neutral",
  sent: "info",
  revised: "gold",
  approved: "success",
  rejected: "danger",
  expired: "warning",
  converted: "success",
};

export default function QuotationsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("quotations:write");
  const [filter, setFilter] = useState<QuotationStatus | "all">("all");
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "err">("ok");
  const { data: quotations, loading, error, reload } = useApiData<Quotation[]>(`/api/quotations?status=${filter}`);
  const { data: products } = useApiData<Product[]>("/api/products");
  const { data: settings } = useApiData<AppSettings>("/api/settings");
  const [editor, setEditor] = useState<{ mode: "new" | "edit" | "revise"; quotation: Quotation | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const rows = quotations ?? [];

  function flash(msg: string, ms = 2500, tone: "ok" | "err" = "ok") {
    setToastTone(tone);
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }

  function openEditor(mode: "new" | "edit" | "revise", quotation: Quotation | null) {
    setEditor({ mode, quotation });
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function setStatus(id: string, status: QuotationStatus) {
    try {
      await api(`/api/quotations/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not update quotation", 3000, "err");
    }
  }

  async function convert(id: string) {
    setBusyId(id);
    try {
      await api(`/api/quotations/${id}`, { method: "POST", body: JSON.stringify({ action: "convert" }) });
      flash("Converted to sale");
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not convert quotation", 4000, "err");
    } finally {
      setBusyId(null);
    }
  }

  async function printQuotation(q: Quotation) {
    try {
      const html = await fetchReceiptHtml(`/api/quotations/${q.id}/print`);
      await printHtmlDocument(html);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not print quotation", 4000, "err");
    }
  }

  async function shareQuotation(q: Quotation) {
    setBusyId(q.id);
    try {
      const shared = await api<{ quotation: Quotation; approvalToken: string }>(
        `/api/quotations/${q.id}`,
        { method: "POST", body: JSON.stringify({ action: "share" }) },
      );
      const approvalUrl = `${window.location.origin}/q/${shared.approvalToken}`;

      try {
        const message = formatQuotationMessage({
          number: q.number,
          customerName: q.customerName,
          total: q.total,
          items: q.lines.length,
          date: q.date,
          expiry: q.expiry,
          approvalUrl,
        });
        window.open(buildWhatsAppUrl(q.customerPhone, message), "_blank", "noopener,noreferrer");
        void api("/api/notifications/log", {
          method: "POST",
          body: JSON.stringify({
            channel: "whatsapp",
            kind: "quotation",
            status: "handoff",
            quotationId: q.id,
            to: q.customerPhone,
          }),
        }).catch(() => {});
      } catch {
        /* WhatsApp hand-off failed — email may still succeed */
      }

      const res = await api<{ email?: { ok: boolean; to?: string; error?: string } }>(
        "/api/notifications/send",
        {
          method: "POST",
          body: JSON.stringify({
            channels: ["email"],
            kind: "quotation",
            toPhone: q.customerPhone,
            customerName: q.customerName,
            total: q.total,
            quotation: {
              id: q.id,
              number: q.number,
              items: q.lines.length,
              date: q.date,
              expiry: q.expiry,
              approvalUrl,
            },
          }),
        },
      );

      if (!res.email?.ok) {
        flash(`WhatsApp opened · link copied · EMAIL FAILED: ${res.email?.error || "Add customer email in CRM"}`, 8000, "err");
      } else {
        flash(`Email sent to ${res.email.to} · WhatsApp opened`, 6000, "ok");
      }
      await navigator.clipboard?.writeText(approvalUrl).catch(() => {});
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not share quotation", 8000, "err");
    } finally {
      setBusyId(null);
    }
  }

  function onSaved(q: Quotation) {
    setEditor(null);
    flash(`Quotation ${q.number} saved`);
    void reload();
  }

  if (loading || !settings) return <LoadingState label="Loading quotations…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Sales Pipeline"
        title="Quotations"
        description="Draft → sent → revised → approved. Full line items, VAT, terms, LPO attachments, and a customer approval link. Converts directly to a sale without re-entry."
        actions={
          canWrite ? (
            <Button variant="gold" onClick={() => openEditor("new", null)}>
              New Quotation
            </Button>
          ) : null
        }
      />

      {toast ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            toastTone === "err"
              ? "border-rose-400/40 bg-rose-500/10 text-rose-700"
              : "border-sage/30 bg-sage-soft text-sage"
          }`}
        >
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
                <td className="px-5 py-3 font-medium">
                  {q.number}
                  {q.version > 1 ? <span className="ml-1.5 text-[11px] text-ink-muted">rev {q.version}</span> : null}
                </td>
                <td className="px-3 py-3">
                  <p>{q.customerName}</p>
                  <p className="text-[11px] text-ink-muted">
                    {q.customerPhone} · {q.lines.length} line{q.lines.length === 1 ? "" : "s"}
                  </p>
                </td>
                <td className="px-3 py-3">
                  {canWrite && q.status !== "converted" ? (
                    <select
                      value={q.status}
                      onChange={(e) => void setStatus(q.id, e.target.value as QuotationStatus)}
                      className="rounded border border-line bg-mist px-2 py-1 text-xs"
                    >
                      <option value={q.status}>{q.status}</option>
                      {statuses
                        .filter((status) => status !== q.status && status !== "converted")
                        .map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <Badge tone={statusTone[q.status]}>{q.status}</Badge>
                  )}
                </td>
                <td className="px-3 py-3 text-ink-muted">{formatDate(q.date)}</td>
                <td className="px-3 py-3 text-ink-muted">{formatDate(q.expiry)}</td>
                <td className="px-3 py-3 text-right font-medium">{formatMoney(q.total)}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    {canWrite && (q.status === "draft" || q.status === "sent" || q.status === "revised") ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title={q.status === "draft" ? "Edit" : "Revise"}
                        onClick={() => openEditor(q.status === "draft" ? "edit" : "revise", q)}
                      >
                        {q.status === "draft" ? <Pencil className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" title="Print / PDF" onClick={() => void printQuotation(q)}>
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Share (WhatsApp + email + approval link)"
                        disabled={busyId === q.id}
                        onClick={() => void shareQuotation(q)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {q.approvalToken ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Copy approval link"
                        onClick={async () => {
                          await navigator.clipboard.writeText(`${window.location.origin}/q/${q.approvalToken}`);
                          flash("Approval link copied");
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {canWrite && q.status === "approved" ? (
                      <Button size="sm" variant="secondary" disabled={busyId === q.id} onClick={() => void convert(q.id)}>
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

      {editor ? (
        <div ref={formRef}>
          <QuotationEditor
            mode={editor.mode}
            quotation={editor.quotation}
            products={products ?? []}
            settings={settings}
            onSaved={onSaved}
            onCancel={() => setEditor(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/ui/SignaturePad";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { printHtmlDocument, fetchReceiptHtml } from "@/lib/receipt/print";
import type { PublicQuotation } from "@/lib/types";

export default function QuotationApprovalClient({ token }: { token: string }) {
  const [quotation, setQuotation] = useState<PublicQuotation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const sigRef = useRef<SignaturePadHandle>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<PublicQuotation>(`/api/quotations/public/${token}`);
      setQuotation(data);
      setSignedByName(data.customerName || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quotation");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(decision: "approved" | "rejected") {
    setSubmitting(true);
    setError(null);
    try {
      const signatureDataUrl =
        decision === "approved" && sigRef.current && !sigRef.current.isEmpty()
          ? sigRef.current.toDataUrl()
          : undefined;
      const data = await api<PublicQuotation>(`/api/quotations/public/${token}`, {
        method: "POST",
        body: JSON.stringify({ decision, note, signatureDataUrl, signedByName }),
      });
      setQuotation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record your decision");
    } finally {
      setSubmitting(false);
    }
  }

  async function printQuotation() {
    try {
      const html = await fetchReceiptHtml(`/api/quotations/public/${token}/print`);
      await printHtmlDocument(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not print quotation");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-muted">
        Loading quotation…
      </div>
    );
  }

  if (error && !quotation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-center">
        <p className="text-sm text-coral">{error}</p>
      </div>
    );
  }

  if (!quotation) return null;

  const decided = Boolean(quotation.customerDecision);
  const canDecide = !decided && !quotation.expired;

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-[var(--radius,12px)] border border-line/80 bg-paper p-6 shadow-sm sm:p-8">
        <header className="border-b border-line/70 pb-4">
          <h1 className="text-xl font-semibold text-ink">{quotation.store.name}</h1>
          {quotation.store.legalName ? <p className="text-sm text-ink-muted">{quotation.store.legalName}</p> : null}
          {quotation.store.address ? <p className="text-xs text-ink-muted">{quotation.store.address}</p> : null}
        </header>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-semibold">Quotation {quotation.number}</p>
            <p className="text-xs text-ink-muted">
              Date {formatDate(quotation.date)} · Valid until {formatDate(quotation.expiry)}
            </p>
          </div>
          <button type="button" onClick={() => void printQuotation()} className="text-sm font-medium text-ink underline">
            Print / Save PDF
          </button>
        </div>

        {quotation.expired ? (
          <p className="mt-3 rounded border border-amber/30 bg-amber-soft px-3 py-2 text-sm text-amber">
            This quotation has expired. Please contact us for an updated quote.
          </p>
        ) : null}

        <p className="mt-3 text-sm">
          Hi <strong>{quotation.customerName}</strong>, please review the items below.
        </p>

        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="py-1.5">Item</th>
              <th className="py-1.5 text-right">Qty</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((line, i) => (
              <tr key={i} className="border-t border-line/50">
                <td className="py-2">
                  {line.name}
                  {line.bottleNote || line.designNote ? (
                    <span className="block text-[11px] text-ink-muted">
                      {[line.bottleNote, line.designNote].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  {line.qty} {line.unitLabel}
                </td>
                <td className="py-2 text-right">{formatMoney(line.unitPrice)}</td>
                <td className="py-2 text-right">{formatMoney(line.qty * line.unitPrice + (line.charges || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 space-y-1 border-t border-line/70 pt-3 text-sm">
          <div className="flex justify-between text-ink-muted">
            <span>Subtotal</span>
            <span>{formatMoney(quotation.subtotal)}</span>
          </div>
          {quotation.vatPercent > 0 ? (
            <div className="flex justify-between text-ink-muted">
              <span>VAT ({quotation.vatPercent}%)</span>
              <span>{formatMoney(quotation.vatAmount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(quotation.total)}</span>
          </div>
        </div>

        {quotation.paymentTerms || quotation.deliveryTerms || quotation.termsText ? (
          <div className="mt-4 space-y-1 text-xs text-ink-muted">
            {quotation.paymentTerms ? <p><strong>Payment terms:</strong> {quotation.paymentTerms}</p> : null}
            {quotation.deliveryTerms ? <p><strong>Delivery terms:</strong> {quotation.deliveryTerms}</p> : null}
            {quotation.termsText ? <p className="whitespace-pre-wrap">{quotation.termsText}</p> : null}
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}

        {decided ? (
          <div className="mt-6 rounded border border-line/70 bg-mist/40 px-4 py-3 text-sm">
            <p className="font-medium capitalize">You {quotation.customerDecision} this quotation.</p>
            {quotation.customerDecisionAt ? (
              <p className="text-xs text-ink-muted">{formatDate(quotation.customerDecisionAt)}</p>
            ) : null}
          </div>
        ) : canDecide ? (
          <div className="mt-6 space-y-3 border-t border-line/70 pt-4">
            <label className="block text-xs text-ink-muted">
              Your name (for signature)
              <input
                value={signedByName}
                onChange={(e) => setSignedByName(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm"
              />
            </label>
            <div>
              <p className="mb-1 text-xs text-ink-muted">Sign to approve</p>
              <SignaturePad ref={sigRef} className="h-32 w-full rounded border border-line bg-white" />
              <button type="button" onClick={() => sigRef.current?.clear()} className="mt-1 text-xs text-ink-muted underline">
                Clear signature
              </button>
            </div>
            <label className="block text-xs text-ink-muted">
              Note (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-line bg-mist px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void decide("approved")}
                className="h-10 flex-1 rounded-full bg-ink text-sm font-medium text-canvas disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Approve"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void decide("rejected")}
                className="h-10 flex-1 rounded-full border border-line text-sm font-medium text-ink disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

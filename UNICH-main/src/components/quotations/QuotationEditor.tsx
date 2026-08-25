"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { SignaturePad, type SignaturePadHandle } from "@/components/ui/SignaturePad";
import { useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { AppSettings, Customer, Formula, Product, Quotation, QuotationLineType } from "@/lib/types";

type EditorMode = "new" | "edit" | "revise";

type DraftLine = {
  key: string;
  kind: "catalog" | "custom_blend";
  productId: string;
  name: string;
  qty: string;
  unitLabel: string;
  unitPrice: string;
  formulaId: string;
  formulaName: string;
  packagingProductIds: string[];
  bottleNote: string;
  designNote: string;
  charges: string;
  notes: string;
};

let keySeq = 0;
function newLine(kind: DraftLine["kind"] = "catalog"): DraftLine {
  keySeq += 1;
  return {
    key: `l${keySeq}`,
    kind,
    productId: "",
    name: "",
    qty: "1",
    unitLabel: kind === "custom_blend" ? "bottle" : "pcs",
    unitPrice: "",
    formulaId: "",
    formulaName: "",
    packagingProductIds: [],
    bottleNote: "",
    designNote: "",
    charges: "0",
    notes: "",
  };
}

function linesFromQuotation(q?: Quotation | null): DraftLine[] {
  if (!q?.lines?.length) return [newLine()];
  return q.lines.map((l) => {
    keySeq += 1;
    return {
      key: `l${keySeq}`,
      kind: l.lineType === "custom_blend" ? "custom_blend" : "catalog",
      productId: l.productId || "",
      name: l.name,
      qty: String(l.qty),
      unitLabel: l.unitLabel,
      unitPrice: String(l.unitPrice),
      formulaId: l.formulaId || "",
      formulaName: l.formulaName || "",
      packagingProductIds: l.packagingProductIds || [],
      bottleNote: l.bottleNote || "",
      designNote: l.designNote || "",
      charges: String(l.charges ?? 0),
      notes: l.notes || "",
    };
  });
}

export function QuotationEditor({
  mode,
  quotation,
  products,
  settings,
  onSaved,
  onCancel,
}: {
  mode: EditorMode;
  quotation?: Quotation | null;
  products: Product[];
  settings: AppSettings;
  onSaved: (q: Quotation) => void;
  onCancel: () => void;
}) {
  const [customerId, setCustomerId] = useState(quotation?.customerId || "");
  const [customerName, setCustomerName] = useState(quotation?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(quotation?.customerPhone || "");
  const [customerEmail, setCustomerEmail] = useState(quotation?.customerEmail || "");
  const [customerTrn, setCustomerTrn] = useState(quotation?.customerTrn || "");
  const [customerAddress, setCustomerAddress] = useState(quotation?.customerAddress || "");
  const [customerPoNumber, setCustomerPoNumber] = useState(quotation?.customerPoNumber || "");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerMatches, setCustomerMatches] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);

  const [lines, setLines] = useState<DraftLine[]>(linesFromQuotation(quotation));
  const [vatPercent, setVatPercent] = useState(String(quotation?.vatPercent ?? settings.vatPercent ?? 0));
  const [paymentTerms, setPaymentTerms] = useState(quotation?.paymentTerms || "");
  const [deliveryTerms, setDeliveryTerms] = useState(quotation?.deliveryTerms || "");
  const [validityDays, setValidityDays] = useState(
    String(quotation?.validityDays ?? settings.quotationDefaultValidityDays ?? 14),
  );
  const [termsText, setTermsText] = useState(quotation?.termsText || settings.quotationTermsTemplate || "");
  const [notes, setNotes] = useState(quotation?.notes || "");
  const [attachments, setAttachments] = useState(quotation?.attachments || []);

  const [captureSignature, setCaptureSignature] = useState(false);
  const [signedByName, setSignedByName] = useState(quotation?.signedByName || "");
  const sigRef = useRef<SignaturePadHandle>(null);

  const [showCustomerDetails, setShowCustomerDetails] = useState(
    Boolean(quotation?.customerTrn || quotation?.customerAddress || quotation?.customerPoNumber),
  );
  const [showMoreOptions, setShowMoreOptions] = useState(
    Boolean(
      quotation?.paymentTerms ||
        quotation?.deliveryTerms ||
        quotation?.notes ||
        quotation?.attachments?.length,
    ),
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: formulas } = useApiData<Formula[]>(
    customerId ? `/api/formulas?customerId=${customerId}` : null,
  );
  const packagingProducts = useMemo(
    () => products.filter((p) => p.itemType === "packaging"),
    [products],
  );

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, l) => sum + Number(l.qty || 0) * Number(l.unitPrice || 0) + Number(l.charges || 0),
      0,
    );
    const vat = subtotal * (Number(vatPercent || 0) / 100);
    return { subtotal, vat, total: subtotal + vat };
  }, [lines, vatPercent]);

  async function searchCustomers() {
    if (!customerQuery.trim()) return;
    setSearching(true);
    try {
      const matches = await api<Customer[]>(`/api/customers?q=${encodeURIComponent(customerQuery)}`);
      setCustomerMatches(matches);
    } catch {
      setCustomerMatches([]);
    } finally {
      setSearching(false);
    }
  }

  function pickCustomer(c: Customer) {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerEmail(c.email || "");
    setCustomerTrn(c.vatNumber || "");
    setCustomerAddress(c.address || "");
    setCustomerMatches([]);
    setCustomerQuery("");
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    updateLine(key, {
      productId,
      name: p?.name || "",
      unitLabel: p?.unit || "pcs",
      unitPrice: p ? String(p.wholesalePrice || p.sellPrice || 0) : "",
    });
  }

  function pickFormula(key: string, formulaId: string) {
    const f = (formulas || []).find((x) => x.id === formulaId);
    updateLine(key, {
      formulaId,
      formulaName: f?.name || "",
      name: f ? `Custom blend — ${f.name}` : "Custom blend",
    });
  }

  function togglePackaging(key: string, productId: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const has = l.packagingProductIds.includes(productId);
        return {
          ...l,
          packagingProductIds: has
            ? l.packagingProductIds.filter((id) => id !== productId)
            : [...l.packagingProductIds, productId],
        };
      }),
    );
  }

  function addAttachment(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            dataBase64: String(reader.result || ""),
            uploadedAt: new Date().toISOString(),
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(name: string) {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }

  async function save() {
    if (!customerName.trim() || !customerPhone.trim()) {
      setError("Customer name and phone are required");
      return;
    }
    const payloadLines = lines
      .filter((l) => Number(l.qty) > 0 && (l.kind === "custom_blend" || l.productId || l.name))
      .map((l) => ({
        productId: l.kind === "catalog" ? l.productId || undefined : undefined,
        name: l.name || (l.kind === "custom_blend" ? "Custom blend" : "Item"),
        qty: Number(l.qty),
        unitLabel: l.unitLabel || "pcs",
        unitPrice: Number(l.unitPrice || 0),
        lineType: (l.kind === "custom_blend" ? "custom_blend" : "wholesale") as QuotationLineType,
        formulaId: l.kind === "custom_blend" ? l.formulaId || undefined : undefined,
        formulaName: l.kind === "custom_blend" ? l.formulaName : undefined,
        packagingProductIds: l.kind === "custom_blend" ? l.packagingProductIds : undefined,
        bottleNote: l.kind === "custom_blend" ? l.bottleNote : undefined,
        designNote: l.kind === "custom_blend" ? l.designNote : undefined,
        charges: Number(l.charges || 0),
        notes: l.notes || undefined,
      }));
    if (!payloadLines.length) {
      setError("Add at least one line item");
      return;
    }

    const signatureDataUrl =
      captureSignature && sigRef.current && !sigRef.current.isEmpty()
        ? sigRef.current.toDataUrl()
        : undefined;

    const payload: Record<string, unknown> = {
      customerId: customerId || undefined,
      customerName,
      customerPhone,
      customerEmail,
      customerTrn,
      customerAddress,
      customerPoNumber,
      lines: payloadLines,
      vatPercent: Number(vatPercent || 0),
      paymentTerms,
      deliveryTerms,
      validityDays: Number(validityDays || 14),
      termsText,
      notes,
      attachments,
    };
    if (signatureDataUrl) {
      payload.signatureDataUrl = signatureDataUrl;
      payload.signedByName = signedByName || customerName;
    }

    setSaving(true);
    setError(null);
    try {
      let saved: Quotation;
      if (mode === "new") {
        saved = await api<Quotation>("/api/quotations", { method: "POST", body: JSON.stringify(payload) });
      } else if (mode === "edit") {
        saved = await api<Quotation>(`/api/quotations/${quotation!.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        saved = await api<Quotation>(`/api/quotations/${quotation!.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "revise", ...payload }),
        });
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save quotation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="mt-5">
      <PanelHeader
        title={mode === "new" ? "New Quotation" : mode === "revise" ? "Revise Quotation" : "Edit Quotation"}
        subtitle="Add the customer and products, then save. Payment terms, VAT, notes and attachments are optional extras."
      />

      {error ? (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 flex gap-2">
          <input
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void searchCustomers())}
            placeholder="Search existing customer by name or phone…"
            className="h-9 flex-1 rounded border border-line bg-mist px-2 text-sm"
          />
          <Button variant="secondary" onClick={() => void searchCustomers()} disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>
        {customerMatches.length > 0 ? (
          <ul className="sm:col-span-2 max-h-32 overflow-y-auto rounded border border-line/60 bg-mist/40">
            {customerMatches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pickCustomer(c)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-mist"
                >
                  <span>{c.name}</span>
                  <span className="text-ink-muted">{c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <Field label="Customer name" value={customerName} onChange={setCustomerName} />
        <Field label="Customer phone" value={customerPhone} onChange={setCustomerPhone} />

        {showCustomerDetails ? (
          <>
            <Field label="Customer email" value={customerEmail} onChange={setCustomerEmail} />
            <Field label="Customer TRN (optional)" value={customerTrn} onChange={setCustomerTrn} />
            <Field label="Customer address" value={customerAddress} onChange={setCustomerAddress} />
            <Field label="Customer PO / LPO number" value={customerPoNumber} onChange={setCustomerPoNumber} />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustomerDetails(true)}
            className="sm:col-span-2 text-left text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            + Add email, TRN, address or PO number
          </button>
        )}
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Line Items</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setLines((prev) => [...prev, newLine("catalog")])}>
              Add product
            </Button>
            <Button variant="secondary" onClick={() => setLines((prev) => [...prev, newLine("custom_blend")])}>
              Add custom blend
            </Button>
          </div>
        </div>

        {lines.map((line) => (
          <div key={line.key} className="rounded border border-line/60 bg-mist/40 p-3">
            {line.kind === "catalog" ? (
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <label className="text-xs text-ink-muted">
                  Product
                  <select
                    value={line.productId}
                    onChange={(e) => pickProduct(line.key, e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-line bg-white px-2"
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Qty" value={line.qty} onChange={(v) => updateLine(line.key, { qty: v })} />
                <Field
                  label="Unit price"
                  value={line.unitPrice}
                  onChange={(v) => updateLine(line.key, { unitPrice: v })}
                />
                <Field
                  label="Charges"
                  value={line.charges}
                  onChange={(v) => updateLine(line.key, { charges: v })}
                />
                <div className="flex items-end">
                  <Button variant="secondary" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <label className="text-xs text-ink-muted">
                    Formula {!customerId ? <span className="text-coral">(select a customer first)</span> : null}
                    <select
                      value={line.formulaId}
                      onChange={(e) => pickFormula(line.key, e.target.value)}
                      disabled={!customerId}
                      className="mt-1 h-9 w-full rounded border border-line bg-white px-2 disabled:opacity-50"
                    >
                      <option value="">{customerId ? "Select formula (optional)" : "No customer selected"}</option>
                      {(formulas || []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} · {f.type} · {f.yieldMl}ml
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field label="Qty" value={line.qty} onChange={(v) => updateLine(line.key, { qty: v })} />
                  <Field
                    label="Unit price"
                    value={line.unitPrice}
                    onChange={(v) => updateLine(line.key, { unitPrice: v })}
                  />
                  <Field
                    label="Charges"
                    value={line.charges}
                    onChange={(v) => updateLine(line.key, { charges: v })}
                  />
                  <div className="flex items-end">
                    <Button variant="secondary" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                      Remove
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label="Bottle" value={line.bottleNote} onChange={(v) => updateLine(line.key, { bottleNote: v })} />
                  <Field label="Design" value={line.designNote} onChange={(v) => updateLine(line.key, { designNote: v })} />
                  <Field label="Line name" value={line.name} onChange={(v) => updateLine(line.key, { name: v })} />
                </div>
                {packagingProducts.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs text-ink-muted">Packaging</p>
                    <div className="flex flex-wrap gap-2">
                      {packagingProducts.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={line.packagingProductIds.includes(p.id)}
                            onChange={() => togglePackaging(line.key, p.id)}
                          />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5">
        {showMoreOptions ? (
          <button
            type="button"
            onClick={() => setShowMoreOptions(false)}
            className="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            − Hide payment terms, VAT, notes &amp; attachments
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowMoreOptions(true)}
            className="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            + Payment terms, VAT, notes &amp; attachments (using defaults)
          </button>
        )}
      </div>

      {showMoreOptions ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-muted">
              Payment terms
              <input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                list="payment-terms-presets"
                placeholder="e.g. 50% advance, balance on delivery"
                className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm"
              />
              <datalist id="payment-terms-presets">
                {settings.quotationPaymentTermsPresets.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="text-xs text-ink-muted">
              Delivery terms
              <input
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                list="delivery-terms-presets"
                placeholder="e.g. 3–5 working days"
                className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm"
              />
              <datalist id="delivery-terms-presets">
                {settings.quotationDeliveryTermsPresets.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <Field label="Validity (days)" value={validityDays} onChange={setValidityDays} />
            <Field label="VAT %" value={vatPercent} onChange={setVatPercent} />
          </div>

          <label className="mt-3 block text-xs text-ink-muted">
            Terms &amp; conditions
            <textarea
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-line bg-mist px-2 py-1.5 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs text-ink-muted">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-line bg-mist px-2 py-1.5 text-sm"
            />
          </label>

          <div className="mt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-muted">
              Attachments (customer LPO/PO copy, etc.)
            </p>
            <input type="file" multiple onChange={(e) => addAttachment(e.target.files)} className="text-sm" />
            {attachments.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {attachments.map((a) => (
                  <li key={a.name} className="flex items-center justify-between rounded border border-line/60 bg-mist/40 px-2 py-1 text-xs">
                    <span>{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.name)} className="text-coral">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={captureSignature}
                onChange={(e) => setCaptureSignature(e.target.checked)}
              />
              Capture customer signature now (e.g. signed in-store)
            </label>
            {captureSignature ? (
              <div className="mt-2 space-y-2">
                <Field label="Signed by" value={signedByName} onChange={setSignedByName} />
                <SignaturePad ref={sigRef} className="h-32 w-full rounded border border-line bg-white" />
                <Button variant="secondary" size="sm" onClick={() => sigRef.current?.clear()}>
                  Clear signature
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mt-5 flex items-center justify-between rounded border border-line/60 bg-mist/40 px-3 py-2 text-sm">
        <span className="text-ink-muted">
          Subtotal {formatMoney(totals.subtotal)} · VAT {formatMoney(totals.vat)}
        </span>
        <span className="font-semibold">Total {formatMoney(totals.total)}</span>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : mode === "revise" ? "Save Revision" : "Save Quotation"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-ink-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm"
      />
    </label>
  );
}

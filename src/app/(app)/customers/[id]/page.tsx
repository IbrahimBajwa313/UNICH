"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  FlaskConical,
  MapPin,
  Phone,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import type { Customer, Formula, Quotation } from "@/lib/types";

/** CRM-02: purchase history is queried live from Sales, never duplicated onto Customer. */
type CustomerSale = {
  id: string;
  createdAt: string;
  total: number;
  saleType?: string;
  payment: string;
};

const quotationTone: Record<string, "success" | "danger" | "warning" | "info" | "neutral"> = {
  approved: "success",
  rejected: "danger",
  expired: "danger",
  sent: "info",
  revised: "info",
  draft: "neutral",
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  // Remount on id change — resets local draft/error state for free instead
  // of syncing it with an effect (App Router keeps the same component
  // instance across sibling dynamic-segment navigations).
  return <CustomerDetailInner key={params.id} id={params.id} />;
}

function CustomerDetailInner({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  /** CRM-12: Cashier view/edit; delete is Manager+ only. */
  const canDelete = user?.role === "manager" || user?.role === "owner";

  const {
    data: customer,
    loading,
    error,
    reload,
    setData: setCustomer,
  } = useApiData<Customer>(`/api/customers/${id}`);

  const [draft, setDraft] = useState<Partial<Customer> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: customerFormulas, loading: formulasLoading } = useApiData<Formula[]>(
    id ? `/api/formulas?customerId=${id}` : null,
  );
  const { data: customerSales, loading: salesLoading } = useApiData<CustomerSale[]>(
    customer
      ? `/api/sales?customerId=${id}&phone=${encodeURIComponent(customer.phone)}&status=all&limit=10`
      : null,
  );
  const { data: customerQuotes, loading: quotesLoading } = useApiData<Quotation[]>(
    customer ? `/api/quotations?phone=${encodeURIComponent(customer.phone)}` : null,
  );

  async function saveCustomer() {
    if (!draft?.name || !draft.phone) return;
    setFormError(null);
    try {
      const updated = await api<Customer>(`/api/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...draft,
          preferences: draft.preferences || [],
          productsRequested: draft.productsRequested || [],
        }),
      });
      setCustomer(updated);
      setDraft(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save customer");
    }
  }

  async function removeCustomer() {
    if (!customer) return;
    setFormError(null);
    setDeleting(true);
    try {
      await api(`/api/customers/${id}`, { method: "DELETE" });
      router.push("/customers");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not delete customer");
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState label="Loading customer…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!customer) {
    return <ErrorState message="Customer not found" onRetry={() => router.push("/customers")} />;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => router.push("/customers")}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </button>

      <PageHeader
        eyebrow="CRM · Customer Profile"
        title={customer.name}
        description={customer.phone}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(draft ? null : { ...customer });
                setFormError(null);
              }}
            >
              {draft ? "Cancel Edit" : "Edit Customer"}
            </Button>
            {canDelete ? (
              <Button variant="ghost" disabled={deleting} onClick={() => void removeCustomer()}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Panel className="h-fit">
          <PanelHeader title="Details" />
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-ink-muted">
              <Phone className="h-4 w-4" />
              {customer.phone}
            </div>
            {customer.email ? <p className="text-ink-muted">{customer.email}</p> : null}
            {customer.address ? (
              <div className="flex items-start gap-2 text-ink-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{customer.address}</span>
              </div>
            ) : null}
            {customer.vatNumber ? (
              <p className="text-ink-muted">VAT: {customer.vatNumber}</p>
            ) : null}

            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-muted">Preferences</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {customer.preferences.length === 0 ? (
                  <span className="text-ink-muted">None captured</span>
                ) : (
                  customer.preferences.map((p) => (
                    <Badge key={p} tone="info">
                      {p}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {customer.productsRequested && customer.productsRequested.length > 0 ? (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                  Products Requested
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {customer.productsRequested.map((p) => (
                    <Badge key={p} tone="neutral">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {customer.notes ? (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-muted">Notes</p>
                <p className="mt-1 text-ink-muted">{customer.notes}</p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted">Lifetime</p>
                <p className="truncate font-semibold" title={formatMoney(customer.totalPurchases)}>
                  {formatMoney(customer.totalPurchases)}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted">Credit Due</p>
                <p className="truncate font-semibold" title={formatMoney(customer.creditBalance)}>
                  {formatMoney(customer.creditBalance)}
                </p>
              </div>
            </div>
          </div>

          {draft ? (
            <div className="mt-5 border-t border-line/70 pt-4">
              <p className="mb-3 text-sm font-medium">Edit Customer</p>
              <div className="grid gap-3">
                <CustomerInput
                  label="Name"
                  value={draft.name || ""}
                  onChange={(name) => setDraft({ ...draft, name })}
                />
                <CustomerInput
                  label="Phone"
                  value={draft.phone || ""}
                  onChange={(phone) => setDraft({ ...draft, phone })}
                />
                <CustomerInput
                  label="Email"
                  value={draft.email || ""}
                  onChange={(email) => setDraft({ ...draft, email })}
                />
                <CustomerInput
                  label="Address"
                  value={draft.address || ""}
                  onChange={(address) => setDraft({ ...draft, address })}
                />
                <CustomerInput
                  label="VAT Number"
                  value={draft.vatNumber || ""}
                  onChange={(vatNumber) => setDraft({ ...draft, vatNumber })}
                />
              </div>
              <TagInput
                label="Preferences"
                values={draft.preferences || []}
                onChange={(preferences) => setDraft({ ...draft, preferences })}
                placeholder="Type a preference and press Enter…"
              />
              <TagInput
                label="Products Requested"
                values={draft.productsRequested || []}
                onChange={(productsRequested) => setDraft({ ...draft, productsRequested })}
                placeholder="Type a product and press Enter…"
              />
              <CustomerTextarea
                label="Notes"
                value={draft.notes || ""}
                onChange={(notes) => setDraft({ ...draft, notes })}
              />
              {formError ? <p className="mt-3 text-xs text-rose-600">{formError}</p> : null}
              <div className="mt-3 flex gap-2">
                <Button onClick={() => void saveCustomer()}>Save Changes</Button>
                <Button variant="secondary" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : formError ? (
            <p className="mt-3 text-xs text-rose-600">{formError}</p>
          ) : null}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <div className="mb-2 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-gold-deep" />
              <p className="text-sm font-medium">Saved Formulas</p>
            </div>
            {formulasLoading || !customerFormulas?.length ? (
              <p className="text-xs text-ink-muted">No custom formulas yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {customerFormulas.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-lg border border-line/70 bg-mist/30 px-3 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{f.name}</p>
                      <Badge
                        tone={
                          f.status === "approved"
                            ? "success"
                            : f.status === "rejected"
                              ? "danger"
                              : f.status === "archived"
                                ? "neutral"
                                : "warning"
                        }
                      >
                        {f.status || "draft"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-ink-muted">
                      {f.recipeHidden
                        ? `${f.yieldMl} ml · v${f.version || 1} · recipe hidden`
                        : `${f.components.length} components · ${f.yieldMl} ml · v${f.version || 1}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <div className="mb-2 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-gold-deep" />
              <p className="text-sm font-medium">Purchase History</p>
            </div>
            {salesLoading || !customerSales?.length ? (
              <p className="text-xs text-ink-muted">No purchases yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {customerSales.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line/70 bg-mist/30 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{s.saleType || "Retail"}</p>
                      <p className="text-[11px] text-ink-muted">
                        {formatDate(s.createdAt)} · {s.payment}
                      </p>
                    </div>
                    <p className="font-semibold">{formatMoney(s.total)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gold-deep" />
              <p className="text-sm font-medium">Quotations</p>
            </div>
            {quotesLoading || !customerQuotes?.length ? (
              <p className="text-xs text-ink-muted">No quotations yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {customerQuotes.map((q) => (
                  <li
                    key={q.id}
                    className="rounded-lg border border-line/70 bg-mist/30 px-3 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{q.number}</p>
                      <div className="flex gap-1">
                        {q.convertedToSaleId ? <Badge tone="success">Converted</Badge> : null}
                        <Badge tone={quotationTone[q.status] || "neutral"}>{q.status}</Badge>
                      </div>
                    </div>
                    <p className="text-[11px] text-ink-muted">
                      {formatDate(q.date)} · {formatMoney(q.total)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function CustomerInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-ink-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm"
      />
    </label>
  );
}

function CustomerTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block text-xs text-ink-muted">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded border border-line bg-mist px-2 py-1.5 text-sm"
      />
    </label>
  );
}

/** Chip-style multi-value entry — replaces raw "comma separated" text fields. */
function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function commit(raw: string) {
    const tag = raw.trim();
    setText("");
    if (!tag) return;
    if (values.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    onChange([...values, tag]);
  }

  return (
    <label className="mt-3 block text-xs text-ink-muted">
      {label}
      <div className="mt-1 flex min-h-9 flex-wrap items-center gap-1.5 rounded border border-line bg-mist px-2 py-1.5 focus-within:border-gold">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold-soft"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(values.filter((v) => v !== tag))}
              className="text-gold-soft/70 hover:text-gold-soft"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(text);
            } else if (e.key === "Backspace" && text === "" && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => commit(text)}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm text-ink outline-none placeholder:text-ink-muted/60"
        />
      </div>
    </label>
  );
}

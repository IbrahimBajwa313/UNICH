"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  FlaskConical,
  MapPin,
  Phone,
  Search,
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

const emptyCustomers: Customer[] = [];

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

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageInner />
    </Suspense>
  );
}

function CustomersPageInner() {
  const { user } = useAuth();
  /** CRM-12: Cashier view/create/edit; delete is Manager+ only. */
  const canDelete = user?.role === "manager" || user?.role === "owner";

  const searchParams = useSearchParams();
  const { data: customers, loading, error, reload } = useApiData<Customer[]>("/api/customers");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Partial<Customer> | null>(null);
  const [dupMatch, setDupMatch] = useState<Customer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const draftFormRef = useRef<HTMLDivElement>(null);
  const draftOpen = draft !== null;

  // Row click / "Edit Customer" pre-fills the form but it renders below the
  // profile panel — scroll it into view so the fields are actually visible.
  useEffect(() => {
    if (!draftOpen) return;
    const id = requestAnimationFrame(() => {
      draftFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [draftOpen]);

  // POS "Complete Sale" on a converted quotation hands off here with ?customerId=
  // — just another initial-selection fallback, same role as "first customer".
  const activeId = selectedId || searchParams.get("customerId") || customers?.[0]?.id || "";
  const customerList = customers ?? emptyCustomers;
  const selected = customerList.find((c) => c.id === activeId);

  const { data: customerFormulas, loading: formulasLoading } = useApiData<Formula[]>(
    activeId ? `/api/formulas?customerId=${activeId}` : null,
  );
  const { data: customerSales, loading: salesLoading } = useApiData<CustomerSale[]>(
    selected
      ? `/api/sales?customerId=${activeId}&phone=${encodeURIComponent(selected.phone)}&status=all&limit=10`
      : null,
  );
  const { data: customerQuotes, loading: quotesLoading } = useApiData<Quotation[]>(
    selected ? `/api/quotations?phone=${encodeURIComponent(selected.phone)}` : null,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customerList.filter(
      (c) =>
        q === "" ||
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [customerList, query]);

  function findDuplicate(input: Partial<Customer>): Customer | null {
    const digits = (input.phone || "").replace(/\D/g, "");
    const email = (input.email || "").trim().toLowerCase();
    return (
      customerList.find((c) => {
        if (c.id === input.id) return false;
        const cDigits = c.phone.replace(/\D/g, "");
        const phoneMatch = digits.length >= 7 && cDigits === digits;
        const emailMatch = Boolean(email) && (c.email || "").trim().toLowerCase() === email;
        return phoneMatch || emailMatch;
      }) || null
    );
  }

  async function saveCustomer(force = false) {
    if (!draft?.name || !draft.phone) return;
    setFormError(null);

    // CRM-11: warn on phone/email match before creating a brand-new profile.
    if (!draft.id && !force) {
      const match = findDuplicate(draft);
      if (match) {
        setDupMatch(match);
        return;
      }
    }

    try {
      await api(draft.id ? `/api/customers/${draft.id}` : "/api/customers", {
        method: draft.id ? "PUT" : "POST",
        body: JSON.stringify({
          ...draft,
          preferences: draft.preferences || [],
          productsRequested: draft.productsRequested || [],
          forceCreate: force,
        }),
      });
      setDraft(null);
      setDupMatch(null);
      await reload();
    } catch (err) {
      const e = err as Error & { status?: number; data?: { existing?: Customer } };
      if (e.status === 409 && e.data?.existing) {
        setDupMatch(e.data.existing);
        return;
      }
      setFormError(e.message || "Could not save customer");
    }
  }

  async function removeCustomer() {
    if (!selected) return;
    setFormError(null);
    try {
      await api(`/api/customers/${selected.id}`, { method: "DELETE" });
      setSelectedId("");
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not delete customer");
    }
  }

  if (loading) return <LoadingState label="Loading customers…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Customers"
        description="Capture phone for marketing, fragrance preferences, purchase history, and saved custom formulas. Loyalty & complaints planned for later phases."
        actions={<Button variant="gold" onClick={() => { setDraft({ preferences: [], productsRequested: [] }); setDupMatch(null); setFormError(null); }}>Add Customer</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Panel padding={false}>
          <div className="border-b border-line/70 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or phone…"
                className="h-10 w-full rounded-full border border-line bg-mist pr-3 pl-10 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              />
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Last Visit</th>
                <th className="px-5 py-2.5 text-right font-medium">LTV</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setDraft({ ...c }); setDupMatch(null); setFormError(null); }}
                  className={`cursor-pointer border-t border-line/60 hover:bg-mist/40 ${
                    activeId === c.id ? "bg-gold/10" : ""
                  }`}
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">{c.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.hasCustomFormula ? (
                        <Badge tone="gold">Formula</Badge>
                      ) : null}
                      {c.creditBalance > 0 ? (
                        <Badge tone="warning">Credit</Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-muted">{c.phone}</td>
                  <td className="px-3 py-3 text-ink-muted">
                    {formatDate(c.lastVisit)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
                    {formatMoney(c.totalPurchases)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {selected ? <Panel>
          <PanelHeader title={selected.name} subtitle="Customer profile" />
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-ink-muted">
              <Phone className="h-4 w-4" />
              {selected.phone}
            </div>
            {selected.email ? (
              <p className="text-ink-muted">{selected.email}</p>
            ) : null}
            {selected.address ? (
              <div className="flex items-start gap-2 text-ink-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{selected.address}</span>
              </div>
            ) : null}
            {selected.vatNumber ? (
              <p className="text-ink-muted">VAT: {selected.vatNumber}</p>
            ) : null}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                Preferences
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selected.preferences.length === 0 ? (
                  <span className="text-ink-muted">None captured</span>
                ) : (
                  selected.preferences.map((p) => (
                    <Badge key={p} tone="info">
                      {p}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            {selected.productsRequested && selected.productsRequested.length > 0 ? (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                  Products Requested
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selected.productsRequested.map((p) => (
                    <Badge key={p} tone="neutral">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {selected.notes ? (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                  Notes
                </p>
                <p className="mt-1 text-ink-muted">{selected.notes}</p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                  Lifetime
                </p>
                <p className="font-semibold">{formatMoney(selected.totalPurchases)}</p>
              </div>
              <div className="rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                  Credit Due
                </p>
                <p className="font-semibold">{formatMoney(selected.creditBalance)}</p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-gold-deep" />
              <p className="text-sm font-medium">Saved Formulas</p>
            </div>
            {formulasLoading || !customerFormulas?.length ? (
              <p className="text-xs text-ink-muted">No custom formulas yet.</p>
            ) : (
              <ul className="space-y-2">
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
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-gold-deep" />
              <p className="text-sm font-medium">Purchase History</p>
            </div>
            {salesLoading || !customerSales?.length ? (
              <p className="text-xs text-ink-muted">No purchases yet.</p>
            ) : (
              <ul className="space-y-2">
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
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gold-deep" />
              <p className="text-sm font-medium">Quotations</p>
            </div>
            {quotesLoading || !customerQuotes?.length ? (
              <p className="text-xs text-ink-muted">No quotations yet.</p>
            ) : (
              <ul className="space-y-2">
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
          </div>

          {formError ? <p className="mt-3 text-xs text-rose-600">{formError}</p> : null}
          <div className="mt-5 flex gap-2">
            <Button className="flex-1" variant="secondary" onClick={() => { setDraft({ ...selected }); setDupMatch(null); setFormError(null); }}>Edit Customer</Button>
            {canDelete ? (
              <Button variant="ghost" onClick={removeCustomer}><Trash2 className="h-4 w-4" /></Button>
            ) : null}
          </div>
        </Panel> : <Panel><p className="text-sm text-ink-muted">No customers yet.</p></Panel>}
      </div>
      {draft ? <Panel ref={draftFormRef} className="mt-5"><PanelHeader title={draft.id ? "Edit Customer" : "New Customer"} subtitle="Customer profile data" /><div className="grid gap-3 sm:grid-cols-3">
        <CustomerInput label="Name" value={draft.name || ""} onChange={(name) => setDraft({ ...draft, name })} />
        <CustomerInput label="Phone" value={draft.phone || ""} onChange={(phone) => setDraft({ ...draft, phone })} />
        <CustomerInput label="Email" value={draft.email || ""} onChange={(email) => setDraft({ ...draft, email })} />
        <CustomerInput label="Address" value={draft.address || ""} onChange={(address) => setDraft({ ...draft, address })} />
        <CustomerInput label="VAT Number" value={draft.vatNumber || ""} onChange={(vatNumber) => setDraft({ ...draft, vatNumber })} />
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
      <CustomerTextarea label="Notes" value={draft.notes || ""} onChange={(notes) => setDraft({ ...draft, notes })} />

      {dupMatch ? (
        <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800">
          <p>
            A customer with this phone or email already exists: <span className="font-medium">{dupMatch.name}</span> ({dupMatch.phone})
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { setSelectedId(dupMatch.id); setDraft(null); setDupMatch(null); }}>Use Existing</Button>
            <Button size="sm" variant="secondary" onClick={() => void saveCustomer(true)}>Create New Anyway</Button>
          </div>
        </div>
      ) : null}
      {formError ? <p className="mt-3 text-xs text-rose-600">{formError}</p> : null}
      <div className="mt-3 flex gap-2"><Button onClick={() => void saveCustomer()}>Save Customer</Button><Button variant="secondary" onClick={() => { setDraft(null); setDupMatch(null); setFormError(null); }}>Cancel</Button></div></Panel> : null}
    </div>
  );
}

function CustomerInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs text-ink-muted">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm" /></label>;
}

function CustomerTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="mt-3 block text-xs text-ink-muted">{label}<textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="mt-1 w-full rounded border border-line bg-mist px-2 py-1.5 text-sm" /></label>;
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

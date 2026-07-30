"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Phone, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import type { Customer, Formula } from "@/lib/types";

const emptyCustomers: Customer[] = [];

export default function CustomersPage() {
  const { data: customers, loading, error, reload } = useApiData<Customer[]>("/api/customers");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Partial<Customer> | null>(null);
  const activeId = selectedId || customers?.[0]?.id || "";
  const { data: customerFormulas, loading: formulasLoading } = useApiData<Formula[]>(
    activeId ? `/api/formulas?customerId=${activeId}` : null,
  );
  const customerList = customers ?? emptyCustomers;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customerList.filter(
      (c) =>
        q === "" ||
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [customerList, query]);

  const selected = customerList.find((c) => c.id === activeId);
  async function saveCustomer() {
    if (!draft?.name || !draft.phone) return;
    await api(draft.id ? `/api/customers/${draft.id}` : "/api/customers", {
      method: draft.id ? "PUT" : "POST",
      body: JSON.stringify({ ...draft, preferences: draft.preferences || [] }),
    });
    setDraft(null); await reload();
  }
  async function removeCustomer() {
    if (!selected) return;
    await api(`/api/customers/${selected.id}`, { method: "DELETE" });
    setSelectedId(""); await reload();
  }
  if (loading) return <LoadingState label="Loading customers…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Customers"
        description="Capture phone for marketing, fragrance preferences, purchase history, and saved custom formulas. Loyalty & complaints planned for later phases."
        actions={<Button variant="gold" onClick={() => setDraft({ preferences: [] })}>Add Customer</Button>}
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
                  onClick={() => setSelectedId(c.id)}
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
                    <p className="font-medium">{f.name}</p>
                    <p className="text-[11px] text-ink-muted">
                      {f.components.length} components · {f.yieldMl} ml
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 flex gap-2"><Button className="flex-1" variant="secondary" onClick={() => setDraft({ ...selected })}>Edit Customer</Button><Button variant="ghost" onClick={removeCustomer}><Trash2 className="h-4 w-4" /></Button></div>
        </Panel> : <Panel><p className="text-sm text-ink-muted">No customers yet.</p></Panel>}
      </div>
      {draft ? <Panel className="mt-5"><PanelHeader title={draft.id ? "Edit Customer" : "New Customer"} subtitle="Customer profile data" /><div className="grid gap-3 sm:grid-cols-3">
        <CustomerInput label="Name" value={draft.name || ""} onChange={(name) => setDraft({ ...draft, name })} />
        <CustomerInput label="Phone" value={draft.phone || ""} onChange={(phone) => setDraft({ ...draft, phone })} />
        <CustomerInput label="Email" value={draft.email || ""} onChange={(email) => setDraft({ ...draft, email })} />
      </div><CustomerInput label="Preferences (comma separated)" value={(draft.preferences || []).join(", ")} onChange={(preferences) => setDraft({ ...draft, preferences: preferences.split(",").map((p) => p.trim()).filter(Boolean) })} /><div className="mt-3 flex gap-2"><Button onClick={saveCustomer}>Save Customer</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div></Panel> : null}
    </div>
  );
}

function CustomerInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs text-ink-muted">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm" /></label>;
}

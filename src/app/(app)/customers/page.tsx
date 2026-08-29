"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import type { Customer } from "@/lib/types";

const emptyCustomers: Customer[] = [];

export default function CustomersPage() {
  const router = useRouter();
  const { data: customers, loading, error, reload } = useApiData<Customer[]>("/api/customers");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Partial<Customer> | null>(null);
  const [dupMatch, setDupMatch] = useState<Customer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const customerList = customers ?? emptyCustomers;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customerList.filter(
      (c) => q === "" || c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [customerList, query]);

  function findDuplicate(input: Partial<Customer>): Customer | null {
    const digits = (input.phone || "").replace(/\D/g, "");
    const email = (input.email || "").trim().toLowerCase();
    return (
      customerList.find((c) => {
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
    if (!force) {
      const match = findDuplicate(draft);
      if (match) {
        setDupMatch(match);
        return;
      }
    }

    try {
      const created = await api<Customer>("/api/customers", {
        method: "POST",
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
      router.push(`/customers/${created.id}`);
    } catch (err) {
      const e = err as Error & { status?: number; data?: { existing?: Customer } };
      if (e.status === 409 && e.data?.existing) {
        setDupMatch(e.data.existing);
        return;
      }
      setFormError(e.message || "Could not save customer");
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
        actions={
          <Button
            variant="gold"
            onClick={() => {
              setDraft({ preferences: [], productsRequested: [] });
              setDupMatch(null);
              setFormError(null);
            }}
          >
            Add Customer
          </Button>
        }
      />

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
        {filtered.length === 0 ? (
          <p className="p-5 text-sm text-ink-muted">No customers yet.</p>
        ) : (
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
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className="cursor-pointer border-t border-line/60 hover:bg-mist/40"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">{c.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.hasCustomFormula ? <Badge tone="gold">Formula</Badge> : null}
                      {c.creditBalance > 0 ? <Badge tone="warning">Credit</Badge> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-muted">{c.phone}</td>
                  <td className="px-3 py-3 text-ink-muted">{formatDate(c.lastVisit)}</td>
                  <td className="px-5 py-3 text-right font-medium">
                    {formatMoney(c.totalPurchases)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {draft ? (
        <Panel className="mt-5">
          <PanelHeader title="New Customer" subtitle="Customer profile data" />
          <div className="grid gap-3 sm:grid-cols-3">
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

          {dupMatch ? (
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800">
              <p>
                A customer with this phone or email already exists:{" "}
                <span className="font-medium">{dupMatch.name}</span> ({dupMatch.phone})
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => router.push(`/customers/${dupMatch.id}`)}>
                  Use Existing
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void saveCustomer(true)}>
                  Create New Anyway
                </Button>
              </div>
            </div>
          ) : null}
          {formError ? <p className="mt-3 text-xs text-rose-600">{formError}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void saveCustomer()}>Save Customer</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(null);
                setDupMatch(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </Panel>
      ) : null}
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

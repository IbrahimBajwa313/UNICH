"use client";

import { useState } from "react";
import { Eye, Lock, Shield, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { api } from "@/lib/api";
import { formatQty } from "@/lib/format";
import type { Formula } from "@/lib/types";

export default function FormulasPage() {
  const { data: formulas, loading, error, reload } = useApiData<Formula[]>("/api/formulas");
  const [selectedId, setSelectedId] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState<Partial<Formula> | null>(null);
  const activeId = selectedId || formulas?.[0]?.id || "";
  const selected = formulas?.find((f) => f.id === activeId);
  async function saveFormula() {
    if (!draft?.name || !draft.type || !draft.yieldMl) return;
    const body = { ...draft, components: draft.components || [] };
    await api(draft.id ? `/api/formulas/${draft.id}` : "/api/formulas", {
      method: draft.id ? "PUT" : "POST", body: JSON.stringify(body),
    });
    setDraft(null); await reload();
  }
  async function removeFormula() {
    if (!selected) return;
    await api(`/api/formulas/${selected.id}`, { method: "DELETE" });
    setSelectedId(""); await reload();
  }
  if (loading) return <LoadingState label="Loading formulas…" />;
  if (error || !formulas) return <ErrorState message={error || "Failed to load formulas"} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Manufacturing"
        title="Formulas & BOM Engine"
        description="Dynamic bill of materials for remix, refill, signature batches, and saved customer formulas. Admin-only access to view and edit."
        actions={
          unlocked ? (
            <Badge tone="success">
              <Eye className="h-3 w-3" />
              Formula access granted
            </Badge>
          ) : (
            <Button
              variant="gold"
              size="sm"
              onClick={() => setUnlocked(true)}
            >
              <Shield className="h-4 w-4" />
              Admin Unlock
            </Button>
          )
        }
      />

      {!unlocked ? (
        <Panel className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mist">
            <Lock className="h-6 w-6 text-ink-muted" />
          </div>
          <h2 className="mt-4 font-semibold text-2xl text-ink">Restricted Module</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Only Admin can view, edit, export, or create perfume formulas. Sales
            staff can sell remix without seeing component ratios.
          </p>
          <Button className="mt-6" variant="gold" onClick={() => setUnlocked(true)}>
            Simulate Admin Password
          </Button>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Panel padding={false}>
            <div className="border-b border-line/70 px-4 py-3">
              <p className="text-sm font-medium">Formula Library</p>
            </div>
            <ul className="p-2">
              {formulas.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                      activeId === f.id
                        ? "bg-ink text-canvas"
                        : "hover:bg-mist"
                    }`}
                  >
                    <p className="text-sm font-medium">{f.name}</p>
                    <p
                      className={`mt-0.5 text-[11px] ${
                        activeId === f.id ? "text-gold-soft" : "text-ink-muted"
                      }`}
                    >
                      {f.type} · {f.yieldMl} ml
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {selected ? <Panel>
            <PanelHeader
              title={selected.name}
              subtitle={
                selected.customerName
                  ? `Customer formula · ${selected.customerName}`
                  : selected.notes || "Internal formula"
              }
              action={
                <Badge
                  tone={
                    selected.type === "remix"
                      ? "gold"
                      : selected.type === "custom"
                        ? "info"
                        : "success"
                  }
                >
                  {selected.type}
                </Badge>
              }
            />

            {selected.type === "remix" ? (
              <div className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-deep">
                Every Remix sale automatically deducts:{" "}
                <strong>20 ml oil + 80 ml ethanol</strong> + bottle, cap,
                atomizer, collar, pouch.
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Component</th>
                    <th className="px-4 py-2.5 font-medium">Qty</th>
                    <th className="px-4 py-2.5 font-medium">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.components.map((c, i) => (
                    <tr key={`${c.productId}-${i}`} className="border-t border-line/60">
                      <td className="px-4 py-3 text-ink-muted">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{c.productName}</td>
                      <td className="px-4 py-3">{c.qty}</td>
                      <td className="px-4 py-3">{c.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Meta label="Yield" value={formatQty(selected.yieldMl, "ml")} />
              <Meta label="Components" value={String(selected.components.length)} />
              <Meta label="Updated" value={selected.updatedAt} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setDraft({ ...selected })}>Edit Formula</Button>
              <Button size="sm" variant="secondary" onClick={() => setDraft({ type: "signature", yieldMl: 100, components: [] })}>New Formula</Button>
              <Button size="sm" variant="ghost" onClick={removeFormula}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button size="sm" variant="secondary">
                Export PDF
              </Button>
              <Button size="sm" variant="secondary">
                Duplicate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setUnlocked(false)}>
                Lock Again
              </Button>
            </div>
          </Panel> : <Panel><p className="text-sm text-ink-muted">No formulas yet. Create one to begin.</p><Button className="mt-3" onClick={() => setDraft({ type: "signature", yieldMl: 100, components: [] })}>New Formula</Button></Panel>}
        </div>
      )}
      {draft ? (
        <Panel className="mt-5">
          <PanelHeader title={draft.id ? "Edit Formula" : "New Formula"} subtitle="Components are stored as BOM lines." />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Name" value={draft.name || ""} onChange={(name) => setDraft({ ...draft, name })} />
            <label className="text-xs text-ink-muted">Type<select value={draft.type || "signature"} onChange={(e) => setDraft({ ...draft, type: e.target.value as Formula["type"] })} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2"><option value="remix">remix</option><option value="custom">custom</option><option value="signature">signature</option></select></label>
            <Input label="Yield ml" type="number" value={String(draft.yieldMl || "")} onChange={(value) => setDraft({ ...draft, yieldMl: Number(value) })} />
          </div>
          <label className="mt-3 block text-xs text-ink-muted">Components (one per line: productId | name | qty | unit)
            <textarea value={(draft.components || []).map((c) => `${c.productId}|${c.productName}|${c.qty}|${c.unit}`).join("\n")} onChange={(e) => setDraft({ ...draft, components: e.target.value.split("\n").filter(Boolean).map((line) => { const [productId, productName, qty, unit] = line.split("|"); return { productId, productName, qty: Number(qty), unit: unit === "ml" ? "ml" : "pcs" }; }) })} className="mt-1 min-h-24 w-full rounded border border-line bg-mist p-2 text-sm" />
          </label>
          <div className="mt-3 flex gap-2"><Button onClick={saveFormula}>Save Formula</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div>
        </Panel>
      ) : null}
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-xs text-ink-muted">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm" /></label>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

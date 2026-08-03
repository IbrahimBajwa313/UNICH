"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Factory, Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { ProductionOrder, ProductionPlannedLine } from "@/lib/types";

const statusTone = {
  draft: "neutral",
  completed: "success",
  cancelled: "warning",
} as const;

type FormulaOption = {
  id: string;
  name: string;
  type: string;
  version: number;
  yieldMl: number;
  customerName?: string;
  needsOilSelection: boolean;
};

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stockSellable?: number;
  sellPrice?: number;
};

type OptionsPayload = {
  formulas: FormulaOption[];
  outputProducts: ProductOption[];
  oilProducts: ProductOption[];
};

type PreviewPayload = {
  formulaName: string;
  formulaType: string;
  yieldMl: number;
  needsOilSelection: boolean;
  oilProductId?: string;
  oilProductName?: string;
  plannedLines: ProductionPlannedLine[];
  defaultOutputQty: number;
};

export default function ProductionPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("Admin");
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const {
    data: orders,
    loading,
    error,
    reload,
  } = useApiData<ProductionOrder[]>(unlocked ? "/api/production" : null);

  const {
    data: options,
    loading: optionsLoading,
    error: optionsError,
    reload: reloadOptions,
  } = useApiData<OptionsPayload>(unlocked ? "/api/production/options" : null);

  const [showForm, setShowForm] = useState(false);
  const [formulaId, setFormulaId] = useState("");
  const [qty, setQty] = useState("1");
  const [oilProductId, setOilProductId] = useState("");
  const [outputProductId, setOutputProductId] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/formula-admin", {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json()) as {
          unlocked?: boolean;
          name?: string;
          email?: string;
        };
        if (cancelled) return;
        if (json.unlocked) {
          setUnlocked(true);
          if (json.name) setAdminName(json.name);
          if (json.email) setAdminEmail(json.email);
        }
      } catch {
        /* stay locked */
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const id = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [showForm]);

  const formulaList = options?.formulas ?? [];
  const outputList = options?.outputProducts ?? [];
  const oilList = options?.oilProducts ?? [];
  const orderList = orders ?? [];
  const selected = orderList.find((o) => o.id === selectedId) || null;

  const selectedFormula = useMemo(
    () => formulaList.find((f) => f.id === formulaId) || null,
    [formulaList, formulaId],
  );

  const stats = useMemo(() => {
    const draft = orderList.filter((o) => o.status === "draft").length;
    const completed = orderList.filter((o) => o.status === "completed").length;
    const batchCount = orderList.filter((o) => o.batch?.batchNumber).length;
    return { draft, completed, batchCount, total: orderList.length };
  }, [orderList]);

  async function unlockAdmin() {
    if (unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/auth/formula-admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail.trim(),
          password,
          name: adminName.trim() || adminEmail.trim() || "Admin",
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        name?: string;
        email?: string;
      };
      if (!res.ok) throw new Error(json.error || "Invalid admin email or password");
      setPassword("");
      setUnlocked(true);
      if (json.name) setAdminName(json.name);
      if (json.email) setAdminEmail(json.email);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setUnlocking(false);
    }
  }

  async function lockAdmin() {
    setUnlocked(false);
    setShowForm(false);
    setPreview(null);
    try {
      await fetch("/api/auth/formula-admin", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      /* best-effort */
    }
  }

  async function runPreview() {
    if (!formulaId) {
      setPreviewError("Select a formula");
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    try {
      const data = await api<PreviewPayload>("/api/production/preview", {
        method: "POST",
        body: JSON.stringify({
          formulaId,
          qty: Number(qty) || 1,
          oilProductId: oilProductId || undefined,
          outputProductId: outputProductId || undefined,
        }),
      });
      setPreview(data);
      if (!outputQty && data.defaultOutputQty) {
        setOutputQty(String(data.defaultOutputQty));
      }
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  function resetForm() {
    setFormulaId("");
    setQty("1");
    setOilProductId("");
    setOutputProductId("");
    setOutputQty("");
    setNotes("");
    setPreview(null);
    setPreviewError(null);
    setFormError(null);
  }

  async function submitOrder(complete: boolean) {
    if (!formulaId || !outputProductId) {
      setFormError("Formula and output product are required");
      return;
    }
    if (selectedFormula?.needsOilSelection && !oilProductId) {
      setFormError("Select an oil for this remix formula");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const created = await api<ProductionOrder>("/api/production", {
        method: "POST",
        body: JSON.stringify({
          formulaId,
          qty: Number(qty) || 1,
          oilProductId: oilProductId || undefined,
          outputProductId,
          outputQty: outputQty ? Number(outputQty) : undefined,
          notes: notes || undefined,
          complete,
        }),
      });
      setShowForm(false);
      resetForm();
      setSelectedId(created.id);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setBusy(false);
    }
  }

  async function completeDraft(id: string) {
    setBusyId(id);
    setFormError(null);
    try {
      await api(`/api/production/${id}/complete`, { method: "POST" });
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to complete order");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelDraft(id: string) {
    setBusyId(id);
    try {
      await api(`/api/production/${id}`, { method: "DELETE" });
      if (selectedId === id) setSelectedId("");
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to cancel order");
    } finally {
      setBusyId(null);
    }
  }

  if (authChecking) return <LoadingState label="Checking admin session…" />;

  if (!unlocked) {
    return (
      <div>
        <PageHeader
          eyebrow="Manufacturing"
          title="Production Orders"
          description="Generate production orders from approved formulas, consume BOM materials on FIFO, and create finished-goods batches."
        />
        <Panel className="mx-auto mt-6 max-w-lg">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Admin unlock required</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Production plans expose formula materials (BLD-04). Unlock with admin
                email + password — same session as Formulas.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <Input
              label="Admin email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              autoComplete="username"
            />
            <Input
              label="Display name"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlockAdmin();
              }}
              autoComplete="current-password"
            />
            {unlockError ? <p className="text-xs text-coral">{unlockError}</p> : null}
            <Button
              variant="gold"
              disabled={unlocking || !password || !adminEmail.trim()}
              onClick={() => void unlockAdmin()}
            >
              {unlocking ? "Unlocking…" : "Admin Unlock"}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  if (loading || optionsLoading) {
    return <LoadingState label="Loading production…" />;
  }
  if (error || optionsError) {
    return (
      <ErrorState
        message={error || optionsError || "Failed to load production"}
        onRetry={() => {
          void reload();
          void reloadOptions();
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Manufacturing"
        title="Production Orders"
        description="Create a production order from an approved formula, preview material consumption, then produce — FIFO deduct ingredients/BOM and add a finished-goods production batch to inventory."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void lockAdmin()}
              title="Lock admin session"
            >
              <Unlock className="h-4 w-4" />
              Lock
            </Button>
            <Button
              variant="gold"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Factory className="h-4 w-4" />
              New Production Order
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders" value={String(stats.total)} hint="loaded" />
        <Stat label="Draft" value={String(stats.draft)} hint="awaiting produce" />
        <Stat label="Completed" value={String(stats.completed)} hint="materials consumed" />
        <Stat label="Batches" value={String(stats.batchCount)} hint="finished goods layers" />
      </div>

      {formError ? (
        <p className="mt-4 rounded-lg border border-coral/30 bg-coral/10 px-4 py-2 text-sm text-coral">
          {formError}
        </p>
      ) : null}

      {showForm ? (
        <Panel ref={formRef} className="mt-6 animate-fade-up">
          <PanelHeader
            title="Generate production order"
            subtitle="Plan materials → save draft or produce now"
            action={
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Close
              </Button>
            }
          />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-muted">Formula</span>
              <select
                className="h-10 w-full rounded-full border border-line bg-mist px-4 text-sm text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                value={formulaId}
                onChange={(e) => {
                  setFormulaId(e.target.value);
                  setPreview(null);
                  const f = formulaList.find((x) => x.id === e.target.value);
                  if (!f?.needsOilSelection) setOilProductId("");
                }}
              >
                <option value="">Select approved formula…</option>
                {formulaList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {f.type} · v{f.version}
                    {f.customerName ? ` · ${f.customerName}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <Input
              label="Qty (formula runs)"
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setPreview(null);
              }}
            />

            {selectedFormula?.needsOilSelection ? (
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-ink-muted">
                  Selected oil (remix oil-base)
                </span>
                <select
                  className="h-10 w-full rounded-full border border-line bg-mist px-4 text-sm text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                  value={oilProductId}
                  onChange={(e) => {
                    setOilProductId(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">Select oil…</option>
                  {oilList.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.sku}) · stock {o.stockSellable ?? 0} ml
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-muted">
                Output product (finished goods)
              </span>
              <select
                className="h-10 w-full rounded-full border border-line bg-mist px-4 text-sm text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                value={outputProductId}
                onChange={(e) => {
                  setOutputProductId(e.target.value);
                  setPreview(null);
                  setOutputQty("");
                }}
              >
                <option value="">Select SKU…</option>
                {outputList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) · {p.unit} · stock {p.stockSellable ?? 0}
                  </option>
                ))}
              </select>
            </label>

            <Input
              label="Output qty (stock to add)"
              type="number"
              min={0}
              step="any"
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              placeholder="Auto from formula yield"
            />

            <div className="md:col-span-2">
              <Input
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional batch notes"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={previewing || !formulaId}
              onClick={() => void runPreview()}
            >
              {previewing ? "Planning…" : "Preview materials"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !formulaId || !outputProductId}
              onClick={() => void submitOrder(false)}
            >
              Save draft
            </Button>
            <Button
              variant="gold"
              disabled={busy || !formulaId || !outputProductId}
              onClick={() => void submitOrder(true)}
            >
              {busy ? "Producing…" : "Produce now"}
            </Button>
          </div>

          {previewError ? (
            <p className="mt-3 text-sm text-coral">{previewError}</p>
          ) : null}

          {preview ? (
            <div className="mt-5 rounded-xl border border-line bg-mist/40 p-4">
              <p className="text-sm font-medium text-ink">
                Material plan · {preview.formulaName} · yield {preview.yieldMl} ml
                {preview.oilProductName
                  ? ` · oil ${preview.oilProductName}`
                  : ""}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="pb-2 font-medium">Component</th>
                      <th className="pb-2 font-medium">Qty</th>
                      <th className="pb-2 font-medium">Unit</th>
                      <th className="pb-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {preview.plannedLines.map((line) => (
                      <tr key={`${line.productId}-${line.reason}`}>
                        <td className="py-2 text-ink">{line.productName}</td>
                        <td className="py-2 tabular-nums text-ink">{line.qty}</td>
                        <td className="py-2 text-ink-muted">{line.unit}</td>
                        <td className="py-2 text-ink-muted">{line.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Default output qty: {preview.defaultOutputQty}. Produce now will FIFO-deduct
                these lines and create a production batch on the output SKU.
              </p>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <PanelHeader
            title="Orders"
            subtitle="Draft → produce → batch"
            action={<Badge tone="info">{orderList.length}</Badge>}
          />
          {orderList.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              No production orders yet. Create one from an approved formula.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="pb-2 font-medium">Order</th>
                    <th className="pb-2 font-medium">Formula</th>
                    <th className="pb-2 font-medium">Qty</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Batch</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {orderList.map((o) => (
                    <tr
                      key={o.id}
                      className={
                        selectedId === o.id ? "bg-gold/5" : "hover:bg-mist/50"
                      }
                    >
                      <td className="py-2.5">
                        <button
                          type="button"
                          className="text-left font-medium text-ink hover:text-gold"
                          onClick={() => setSelectedId(o.id)}
                        >
                          {o.orderNumber}
                        </button>
                        <p className="text-[11px] text-ink-muted">{o.createdAt}</p>
                      </td>
                      <td className="py-2.5">
                        <p className="text-ink">{o.formulaName}</p>
                        <p className="text-[11px] text-ink-muted">
                          {o.formulaType} · v{o.formulaVersion}
                        </p>
                      </td>
                      <td className="py-2.5 tabular-nums text-ink">{o.qty}</td>
                      <td className="py-2.5">
                        <Badge tone={statusTone[o.status]}>{o.status}</Badge>
                      </td>
                      <td className="py-2.5 text-ink-muted">
                        {o.batch?.batchNumber || "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        {o.status === "draft" ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="gold"
                              className="!h-8 !px-3 !text-xs"
                              disabled={busyId === o.id}
                              onClick={() => void completeDraft(o.id)}
                            >
                              Produce
                            </Button>
                            <Button
                              variant="ghost"
                              className="!h-8 !px-3 !text-xs"
                              disabled={busyId === o.id}
                              onClick={() => void cancelDraft(o.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Order detail"
            subtitle={selected ? selected.orderNumber : "Select an order"}
          />
          {!selected ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Select a row to view planned materials, consumption, and batch.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-line bg-mist/40 px-3 py-2">
                <p className="font-medium text-ink">{selected.formulaName}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Output {selected.outputProductName} ({selected.outputSku}) ·{" "}
                  {selected.outputQty} {selected.outputUnit}
                  {selected.oilProductName
                    ? ` · oil ${selected.oilProductName}`
                    : ""}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Planned materials
                </p>
                <ul className="space-y-1.5">
                  {selected.plannedLines.map((l) => (
                    <li
                      key={`${l.productId}-${l.reason}`}
                      className="flex justify-between gap-2 border-b border-line/50 pb-1.5"
                    >
                      <span className="text-ink">{l.productName}</span>
                      <span className="shrink-0 tabular-nums text-ink-muted">
                        {l.qty} {l.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {selected.status === "completed" && selected.batch ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
                  <p className="font-medium text-ink">
                    Batch {selected.batch.batchNumber}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Produced {selected.batch.producedAt} ·{" "}
                    {selected.batch.outputQty} {selected.batch.outputUnit} @{" "}
                    {formatMoney(selected.batch.unitCost)} / unit
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Material cost {formatMoney(selected.batch.totalMaterialCost)} ·
                    FIFO layer added to inventory
                  </p>
                </div>
              ) : null}

              {selected.consumption?.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    FIFO consumption
                  </p>
                  <ul className="space-y-1.5">
                    {selected.consumption.map((c) => (
                      <li
                        key={`${c.productId}-${c.reason}`}
                        className="flex justify-between gap-2 text-xs"
                      >
                        <span className="text-ink">{c.productName}</span>
                        <span className="tabular-nums text-ink-muted">
                          {c.qty} · {formatMoney(c.costTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

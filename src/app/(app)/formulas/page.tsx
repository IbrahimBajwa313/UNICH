"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  Eye,
  History,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { api } from "@/lib/api";
import { formatQty } from "@/lib/format";
import {
  sumLiquidMl,
  validateFormulaInput,
} from "@/lib/formulas/validateFormula";
import {
  matchRemixRole,
  OIL_BASE_PRODUCT_ID,
  REMIX_OIL_ML,
  type RemixRequiredRole,
} from "@/lib/sales/constants";
import type {
  Formula,
  FormulaComponent,
  FormulaStatus,
  Product,
  StockUnit,
} from "@/lib/types";

const UNITS: StockUnit[] = ["ml", "g", "kg", "pcs"];

function statusTone(status: FormulaStatus) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "archived") return "neutral" as const;
  return "warning" as const;
}

const emptyComponent = (): FormulaComponent => ({
  productId: "",
  productName: "",
  qty: 0,
  unit: "ml",
});

const oilBaseComponent = (qty = REMIX_OIL_ML): FormulaComponent => ({
  productId: OIL_BASE_PRODUCT_ID,
  productName: "Selected Oil Blend",
  qty,
  unit: "ml",
});

export default function FormulasPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const formulasUrl = query
    ? `/api/formulas?q=${encodeURIComponent(query)}`
    : "/api/formulas";
  const {
    data: formulas,
    loading,
    error,
    reload,
    setData: setFormulas,
  } = useApiData<Formula[]>(formulasUrl);
  const { data: products } = useApiData<Product[]>("/api/products");
  const [selectedId, setSelectedId] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState<Partial<Formula> | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const draftPanelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const productList = products ?? [];
  const ethanolProduct = useMemo(
    () => productList.find((p) => matchRemixRole(p.name, p.sku) === "ethanol"),
    [productList],
  );
  const fixativeProduct = useMemo(
    () => productList.find((p) => matchRemixRole(p.name, p.sku) === "fixative"),
    [productList],
  );
  const labelProduct = useMemo(
    () => productList.find((p) => matchRemixRole(p.name, p.sku) === "label"),
    [productList],
  );
  const boxProduct = useMemo(
    () => productList.find((p) => matchRemixRole(p.name, p.sku) === "box"),
    [productList],
  );

  const activeId = selectedId || formulas?.[0]?.id || "";
  const selected = formulas?.find((f) => f.id === activeId);
  const pendingCount =
    formulas?.filter((f) => f.status === "draft" || f.status === "rejected")
      .length ?? 0;
  const versionHistory = [...(selected?.versions || [])].reverse();
  const auditLog = [...(selected?.history || [])].reverse();

  const draftLiquid = sumLiquidMl(draft?.components || []);
  const draftYield = Number(draft?.yieldMl) || 0;

  function openDraft(next: Partial<Formula>) {
    setSaveError(null);
    setDraft(next);
    window.setTimeout(() => {
      draftPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      nameInputRef.current?.focus();
    }, 50);
  }

  function duplicateFormula() {
    if (!selected) return;
    openDraft({
      name: `${selected.name} (Copy)`,
      type: selected.type,
      yieldMl: selected.yieldMl,
      notes: selected.notes,
      customerId: selected.customerId,
      customerName: selected.customerName,
      components: selected.components.map((c) => ({ ...c })),
      status: "draft",
    });
  }

  function pickProduct(index: number, productId: string) {
    if (!draft) return;
    if (productId === OIL_BASE_PRODUCT_ID) {
      updateComponent(index, {
        productId: OIL_BASE_PRODUCT_ID,
        productName: "Selected Oil Blend",
        qty: REMIX_OIL_ML,
        unit: "ml",
      });
      return;
    }
    const p = productList.find((x) => x.id === productId);
    updateComponent(index, {
      productId,
      productName: p?.name || "",
      unit: (p?.unit as StockUnit) || "ml",
    });
  }

  type QuickRole = "oil" | Extract<RemixRequiredRole, "ethanol" | "fixative" | "label" | "box">;

  function hasRole(role: QuickRole) {
    const comps = draft?.components || [];
    if (role === "oil") {
      return comps.some((c) => c.productId === OIL_BASE_PRODUCT_ID);
    }
    return comps.some((c) => {
      const p = productList.find((x) => x.id === c.productId);
      return matchRemixRole(c.productName, p?.sku) === role;
    });
  }

  function addQuick(role: QuickRole) {
    if (!draft) return;
    if (hasRole(role)) return;
    if (role === "oil") {
      setDraft({
        ...draft,
        components: [...(draft.components || []), oilBaseComponent()],
      });
      return;
    }
    const productByRole = {
      ethanol: ethanolProduct,
      fixative: fixativeProduct,
      label: labelProduct,
      box: boxProduct,
    } as const;
    const defaultQty: Record<Exclude<QuickRole, "oil">, number> = {
      ethanol: 80,
      fixative: 2,
      label: 1,
      box: 1,
    };
    const hints: Record<Exclude<QuickRole, "oil">, string> = {
      ethanol: "No ethanol product in inventory (name/SKU must match ETH- / Ethanol).",
      fixative: "No fixative product in inventory (name/SKU must match FIX- / Fixative).",
      label: "No label product in inventory (name/SKU must match LBL- / Label).",
      box: "No box product in inventory (name/SKU must match BOX- / GB- / Box).",
    };
    const product = productByRole[role];
    if (!product) {
      setSaveError(hints[role]);
      return;
    }
    setSaveError(null);
    setDraft({
      ...draft,
      components: [
        ...(draft.components || []),
        {
          productId: product.id,
          productName: product.name,
          qty: defaultQty[role],
          unit: (product.unit as StockUnit) || "ml",
        },
      ],
    });
  }

  async function saveFormula() {
    if (!draft || busy) return;
    const components = (draft.components || []).filter(
      (c) => c.productId.trim() || c.productName.trim() || c.qty,
    );
    const errors = validateFormulaInput({
      name: draft.name,
      type: draft.type,
      yieldMl: draft.yieldMl,
      components,
    });
    if (errors.length) {
      setSaveError(errors[0]);
      return;
    }

    const payload = {
      name: draft.name,
      type: draft.type,
      yieldMl: draft.yieldMl,
      components,
      notes: draft.notes,
      customerId: draft.customerId,
      customerName: draft.customerName,
      status: "draft" as const,
      savedBy: "Admin",
    };

    // Optimistic close — editor dismisses immediately; server sync in background.
    const previous = draft.id
      ? (formulas ?? []).find((f) => f.id === draft.id)
      : undefined;
    const optimistic: Formula = {
      id: draft.id || `tmp-${Date.now()}`,
      name: payload.name || "Untitled",
      type: (payload.type as Formula["type"]) || "remix",
      status: "draft",
      version: previous ? (previous.version || 1) + 1 : 1,
      versions: previous?.versions || [],
      history: previous?.history || [],
      customerId: payload.customerId,
      customerName: payload.customerName,
      yieldMl: payload.yieldMl || 0,
      components,
      notes: payload.notes,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    setSaveError(null);
    setBusy(true);
    setFormulas((prev) => {
      const list = prev ?? [];
      if (draft.id) return list.map((f) => (f.id === draft.id ? optimistic : f));
      return [optimistic, ...list];
    });
    setSelectedId(optimistic.id);
    setDraft(null);

    try {
      const saved = await api<Formula>(
        draft.id ? `/api/formulas/${draft.id}` : "/api/formulas",
        {
          method: draft.id ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setFormulas((prev) => {
        const list = prev ?? [];
        if (draft.id) return list.map((f) => (f.id === saved.id ? saved : f));
        return list.map((f) => (f.id === optimistic.id ? saved : f));
      });
      setSelectedId(saved.id);
    } catch (err) {
      if (previous) {
        setFormulas((prev) =>
          (prev ?? []).map((f) => (f.id === previous.id ? previous : f)),
        );
        setSelectedId(previous.id);
      } else {
        setFormulas((prev) =>
          (prev ?? []).filter((f) => f.id !== optimistic.id),
        );
      }
      setDraft({ ...draft, components });
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function removeFormula() {
    if (!selected || busy) return;
    const id = selected.id;
    setBusy(true);
    try {
      await api(`/api/formulas/${id}`, { method: "DELETE" });
      setFormulas((prev) => (prev ?? []).filter((f) => f.id !== id));
      setSelectedId("");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: FormulaStatus) {
    if (!selected || busy) return;
    const previous = selected;
    const optimistic: Formula = {
      ...selected,
      status,
      approvedAt:
        status === "approved"
          ? new Date().toISOString().slice(0, 10)
          : undefined,
      approvedBy: status === "approved" ? "Admin" : undefined,
    };
    setFormulas((prev) =>
      (prev ?? []).map((f) => (f.id === optimistic.id ? optimistic : f)),
    );
    setBusy(true);
    try {
      const updated = await api<Formula>(`/api/formulas/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          approvedBy: status === "approved" ? "Admin" : undefined,
          savedBy: "Admin",
        }),
      });
      setFormulas((prev) =>
        (prev ?? []).map((f) => (f.id === updated.id ? updated : f)),
      );
    } catch {
      setFormulas((prev) =>
        (prev ?? []).map((f) => (f.id === previous.id ? previous : f)),
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreVersion(version: number) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const updated = await api<Formula>(`/api/formulas/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({ restoreVersion: version, savedBy: "Admin" }),
      });
      setFormulas((prev) =>
        (prev ?? []).map((f) => (f.id === updated.id ? updated : f)),
      );
      setShowHistory(true);
      setShowAudit(true);
    } finally {
      setBusy(false);
    }
  }

  function updateComponent(index: number, patch: Partial<FormulaComponent>) {
    if (!draft) return;
    const components = [...(draft.components || [])];
    components[index] = { ...components[index], ...patch };
    setDraft({ ...draft, components });
  }

  if (loading && !formulas) return <LoadingState label="Loading formulas…" />;
  if (error || !formulas) {
    return (
      <ErrorState
        message={error || "Failed to load formulas"}
        onRetry={() => void reload({ silent: true })}
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Manufacturing"
        title="Formulas & BOM Engine"
        description="Dynamic bill of materials for remix, pure oil, and bakhoor (BLD-02), plus saved customer formulas. Only Admin may view, create, edit, approve, print, or export recipes."
        actions={
          unlocked ? (
            <div className="flex flex-wrap items-center gap-2">
              {pendingCount > 0 ? (
                <Badge tone="warning">{pendingCount} awaiting approval</Badge>
              ) : null}
              <Badge tone="success">
                <Eye className="h-3 w-3" />
                Formula access granted
              </Badge>
            </div>
          ) : (
            <Button variant="gold" size="sm" onClick={() => setUnlocked(true)}>
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
            Only Admin can view, create, edit, approve, print, or export perfume
            formulas. Sales staff can sell remix without seeing component ratios.
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
              <label className="relative mt-2 block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, customer, type…"
                  className="h-9 w-full rounded-lg border border-line bg-mist pl-8 pr-3 text-sm outline-none focus:border-gold/50"
                />
              </label>
            </div>
            <ul className="p-2">
              {formulas.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-ink-muted">
                  {query ? `No formulas match “${query}”.` : "No formulas yet."}
                </li>
              ) : (
                formulas.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(f.id);
                        setShowHistory(false);
                        setShowAudit(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                        activeId === f.id ? "bg-ink text-canvas" : "hover:bg-mist"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{f.name}</p>
                        <Badge
                          tone={activeId === f.id ? "gold" : statusTone(f.status)}
                          className="shrink-0"
                        >
                          {f.status}
                        </Badge>
                      </div>
                      <p
                        className={`mt-0.5 text-[11px] ${
                          activeId === f.id ? "text-gold-soft" : "text-ink-muted"
                        }`}
                      >
                        {f.type} · {f.yieldMl} ml · v{f.version || 1}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Panel>

          {selected ? (
            <Panel>
              <PanelHeader
                title={selected.name}
                subtitle={
                  selected.customerName
                    ? `Customer formula · ${selected.customerName}`
                    : selected.notes || "Internal formula"
                }
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                    <Badge tone="info">v{selected.version || 1}</Badge>
                    <Badge
                      tone={
                        selected.type === "remix"
                          ? "gold"
                          : selected.type === "oil"
                            ? "info"
                            : "success"
                      }
                    >
                      {selected.type}
                    </Badge>
                  </div>
                }
              />

              {selected.status === "archived" ? (
                <div className="mb-4 rounded-lg border border-line bg-mist/50 px-4 py-3 text-sm text-ink-muted">
                  This recipe is <strong>archived</strong>. Unarchive to draft before
                  approving for production.
                </div>
              ) : null}

              {selected.status !== "approved" && selected.status !== "archived" ? (
                <div className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
                  This recipe is <strong>{selected.status}</strong>. Admin must approve
                  before it is used for production or remix sales.
                </div>
              ) : null}

              {selected.type === "remix" ? (
                <div className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-deep">
                  Every Remix sale deducts a fixed {REMIX_OIL_ML} ml of selected oil
                  (BLD-02/03 — not tola) plus ethanol and packaging from the approved BOM.
                </div>
              ) : null}

              {selected.type === "oil" ? (
                <div className="mb-4 rounded-lg border border-line bg-mist/50 px-4 py-3 text-sm text-ink-muted">
                  Pure Oil BOM (BLD-02): oil by tola/ml plus bottle and cap packaging.
                </div>
              ) : null}

              {selected.type === "bakhoor" ? (
                <div className="mb-4 rounded-lg border border-line bg-mist/50 px-4 py-3 text-sm text-ink-muted">
                  Bakhoor BOM (BLD-02): bakhoor weight plus packaging bottle and pouch.
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

              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                <Meta label="Yield" value={formatQty(selected.yieldMl, "ml")} />
                <Meta
                  label="Liquid total"
                  value={formatQty(sumLiquidMl(selected.components), "ml")}
                />
                <Meta label="Version" value={`v${selected.version || 1}`} />
                <Meta label="Updated" value={selected.updatedAt} />
                <Meta
                  label="Approved"
                  value={
                    selected.status === "approved"
                      ? `${selected.approvedBy || "Admin"}${selected.approvedAt ? ` · ${selected.approvedAt}` : ""}`
                      : "—"
                  }
                />
              </div>

              {versionHistory.length > 0 ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowHistory((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    <History className="h-3.5 w-3.5" />
                    Version history ({versionHistory.length})
                    <span>{showHistory ? "· hide" : "· show"}</span>
                  </button>
                  {showHistory ? (
                    <ul className="mt-2 space-y-2">
                      {versionHistory.map((v) => (
                        <li
                          key={v.version}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/70 bg-mist/30 px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              v{v.version}{" "}
                              <span className="font-normal text-ink-muted">
                                · {v.status} · {v.components.length} components ·{" "}
                                {v.yieldMl} ml
                              </span>
                            </p>
                            <p className="text-[11px] text-ink-muted">
                              Saved {v.savedAt}
                              {v.savedBy ? ` · ${v.savedBy}` : ""}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void restoreVersion(v.version)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {auditLog.length > 0 ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowAudit((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    <History className="h-3.5 w-3.5" />
                    Audit log ({auditLog.length})
                    <span>{showAudit ? "· hide" : "· show"}</span>
                  </button>
                  {showAudit ? (
                    <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                      {auditLog.map((h, i) => (
                        <li
                          key={`${h.at}-${i}`}
                          className="rounded-lg border border-line/60 bg-mist/20 px-3 py-2 text-xs"
                        >
                          <p className="font-medium text-ink">
                            {h.action.replace("_", " ")}
                            {h.detail ? (
                              <span className="font-normal text-ink-muted">
                                {" "}
                                — {h.detail}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-ink-muted">
                            {h.at}
                            {h.by ? ` · ${h.by}` : ""}
                            {h.fromStatus && h.toStatus
                              ? ` · ${h.fromStatus} → ${h.toStatus}`
                              : ""}
                            {h.fromVersion != null &&
                            h.toVersion != null &&
                            h.fromVersion !== h.toVersion
                              ? ` · v${h.fromVersion} → v${h.toVersion}`
                              : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {selected.status !== "approved" && selected.status !== "archived" ? (
                  <Button
                    size="sm"
                    variant="gold"
                    disabled={busy}
                    onClick={() => void setStatus("approved")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve Formula
                  </Button>
                ) : null}
                {selected.status === "draft" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void setStatus("rejected")}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                ) : null}
                {selected.status === "approved" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void setStatus("draft")}
                  >
                    Revoke Approval
                  </Button>
                ) : null}
                {selected.status === "rejected" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void setStatus("draft")}
                  >
                    Back to Draft
                  </Button>
                ) : null}
                {selected.status !== "archived" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void setStatus("archived")}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void setStatus("draft")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Unarchive
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={selected.status === "archived"}
                  onClick={() =>
                    openDraft({
                      ...selected,
                      components: selected.components.map((c) => ({ ...c })),
                    })
                  }
                >
                  Edit Formula
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    openDraft({
                      type: "remix",
                      yieldMl: 100,
                      components: [emptyComponent()],
                      status: "draft",
                    })
                  }
                >
                  New Formula
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void removeFormula()}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
                <Button size="sm" variant="secondary">
                  Export PDF
                </Button>
                <Button size="sm" variant="secondary" onClick={duplicateFormula}>
                  Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setUnlocked(false)}>
                  Lock Again
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel>
              <p className="text-sm text-ink-muted">No formulas yet. Create one to begin.</p>
              <Button
                className="mt-3"
                onClick={() =>
                  openDraft({
                    type: "remix",
                    yieldMl: 100,
                    components: [emptyComponent()],
                    status: "draft",
                  })
                }
              >
                New Formula
              </Button>
            </Panel>
          )}
        </div>
      )}

      {draft ? (
        <div ref={draftPanelRef} className="mt-5 scroll-mt-6">
          <Panel>
            <PanelHeader
              title={draft.id ? "Edit Formula" : "New Formula"}
              subtitle={
                draft.id
                  ? `Editing v${draft.version || 1} — save creates v${(draft.version || 1) + 1} as draft.`
                  : "Saved as draft — Admin must approve before production use."
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Name"
                value={draft.name || ""}
                inputRef={nameInputRef}
                onChange={(name) => setDraft({ ...draft, name })}
              />
              <label className="text-xs text-ink-muted">
                Type
                <select
                  value={draft.type || "remix"}
                  onChange={(e) =>
                    setDraft({ ...draft, type: e.target.value as Formula["type"] })
                  }
                  className="mt-1 h-9 w-full rounded border border-line bg-mist px-2"
                >
                  <option value="remix">remix</option>
                  <option value="oil">oil</option>
                  <option value="bakhoor">bakhoor</option>
                </select>
              </label>
              <Input
                label="Yield ml"
                type="number"
                value={String(draft.yieldMl || "")}
                onChange={(value) =>
                  setDraft({ ...draft, yieldMl: Number(value) || 0 })
                }
              />
            </div>

            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-muted">BOM ingredients</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={hasRole("oil")}
                    onClick={() => addQuick("oil")}
                  >
                    + Oil
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={hasRole("ethanol") || !ethanolProduct}
                    onClick={() => addQuick("ethanol")}
                  >
                    + Ethanol
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={hasRole("fixative") || !fixativeProduct}
                    onClick={() => addQuick("fixative")}
                  >
                    + Fixative
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={hasRole("label") || !labelProduct}
                    onClick={() => addQuick("label")}
                  >
                    + Label
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={hasRole("box") || !boxProduct}
                    onClick={() => addQuick("box")}
                  >
                    + Box
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        components: [...(draft.components || []), emptyComponent()],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add row
                  </Button>
                </div>
              </div>

              <p
                className={`mb-2 text-xs ${
                  draftYield > 0 && Math.abs(draftLiquid - draftYield) > 0.001
                    ? "text-coral"
                    : "text-ink-muted"
                }`}
              >
                Liquid total {draftLiquid} ml / yield {draftYield || "—"} ml
                {draftYield > 0 && Math.abs(draftLiquid - draftYield) <= 0.001
                  ? " · matched"
                  : " · must match to save (pcs ignored)"}
              </p>

              <div className="space-y-2">
                {(draft.components || []).map((c, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-lg border border-line/70 bg-mist/30 p-2 sm:grid-cols-[1.6fr_0.7fr_0.7fr_auto]"
                  >
                    <select
                      value={c.productId}
                      onChange={(e) => pickProduct(index, e.target.value)}
                      className="h-9 rounded border border-line bg-paper px-2 text-sm"
                    >
                      <option value="">Select product…</option>
                      <option value={OIL_BASE_PRODUCT_ID}>
                        oil-base — Selected Oil Blend (POS picks oil)
                      </option>
                      {c.productId &&
                      c.productId !== OIL_BASE_PRODUCT_ID &&
                      !productList.some((p) => p.id === c.productId) ? (
                        <option value={c.productId}>
                          {c.productName || c.productId}
                        </option>
                      ) : null}
                      {productList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Qty"
                      value={Number.isFinite(c.qty) && c.qty !== 0 ? String(c.qty) : c.qty === 0 ? "0" : ""}
                      onChange={(e) =>
                        updateComponent(index, {
                          qty: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      className="h-9 rounded border border-line bg-paper px-2 text-sm"
                    />
                    <select
                      value={c.unit}
                      onChange={(e) =>
                        updateComponent(index, {
                          unit: e.target.value as StockUnit,
                        })
                      }
                      className="h-9 rounded border border-line bg-paper px-2 text-sm"
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          components: (draft.components || []).filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {(draft.components || []).length === 0 ? (
                  <p className="text-xs text-ink-muted">
                    No ingredients yet. Use + Oil / Ethanol / Fixative or Add row.
                  </p>
                ) : null}
              </div>
            </div>

            {saveError ? (
              <p className="mt-3 rounded-lg border border-coral/30 bg-coral-soft px-3 py-2 text-sm text-coral">
                {saveError}
              </p>
            ) : null}

            <div className="mt-3 flex gap-2">
              <Button disabled={busy} onClick={() => void saveFormula()}>
                Save as Draft
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(null);
                  setSaveError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="text-xs text-ink-muted">
      {label}
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm"
      />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-mist/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

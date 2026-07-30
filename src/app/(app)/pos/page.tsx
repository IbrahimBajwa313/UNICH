"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  FileClock,
  Pause,
  Printer,
  Search,
  Trash2,
  MessageCircle,
  Plus,
  Minus,
  FlaskConical,
  Droplets,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney, tolaToMl } from "@/lib/format";
import type { PaymentMethod, Product } from "@/lib/types";

type CartLine = {
  key: string;
  product: Product;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  lineType: "ready" | "remix" | "oil" | "refill";
  deductMl?: number;
  bomNote?: string;
};
const emptyProducts: Product[] = [];

const payments: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: "cash", label: "Cash", icon: <Banknote className="h-4 w-4" /> },
  { id: "card", label: "Card", icon: <CreditCard className="h-4 w-4" /> },
  { id: "bank", label: "Bank", icon: <Banknote className="h-4 w-4" /> },
  { id: "credit", label: "Credit", icon: <FileClock className="h-4 w-4" /> },
  { id: "mixed", label: "Mixed", icon: <CreditCard className="h-4 w-4" /> },
];

export default function PosPage() {
  const { data: products, loading, error, reload } = useApiData<Product[]>("/api/products");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [phone, setPhone] = useState("");
  const [held, setHeld] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const inventory = products ?? emptyProducts;

  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter(
      (p) =>
        p.category !== "Packaging" &&
        (q === "" ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)),
    );
  }, [inventory, query]);

  const quick = inventory.filter((p) => p.isQuickButton);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  function addReady(product: Product) {
    setCart((prev) => {
      const existing = prev.find(
        (l) => l.product.id === product.id && l.lineType === "ready",
      );
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: `${product.id}-ready-${Date.now()}`,
          product,
          qty: 1,
          unitLabel: product.unit,
          unitPrice: product.sellPrice,
          lineType: "ready",
        },
      ];
    });
  }

  function addRemix() {
    const remix = inventory.find((p) => p.category === "Customized Perfumes");
    if (!remix) return flash("Create a customized perfume product first");
    setCart((prev) => [
      ...prev,
      {
        key: `remix-${Date.now()}`,
        product: remix,
        qty: 1,
        unitLabel: "pcs",
        unitPrice: remix.sellPrice,
        lineType: "remix",
        bomNote: "BOM: 20ml oil + 80ml ethanol + bottle kit",
      },
    ]);
    flash("Remix added — BOM will deduct on checkout");
  }

  function addOil(product: Product, unit: "tola" | "half_tola" | "quarter_tola") {
    const ml = tolaToMl(unit);
    const label =
      unit === "tola" ? "1 Tola" : unit === "half_tola" ? "½ Tola" : "¼ Tola";
    setCart((prev) => [
      ...prev,
      {
        key: `${product.id}-${unit}-${Date.now()}`,
        product,
        qty: 1,
        unitLabel: label,
        unitPrice: Number((product.sellPrice * ml).toFixed(3)),
        lineType: "oil",
        deductMl: ml,
        bomNote: `Deduct ${ml} ml from ${product.name}`,
      },
    ]);
  }

  function addRefill() {
    const oil = inventory.find((p) => p.unit === "ml");
    if (!oil) return flash("Create an oil product first");
    setCart((prev) => [
      ...prev,
      {
        key: `refill-${Date.now()}`,
        product: oil,
        qty: 1,
        unitLabel: "100ml refill",
        unitPrice: 120,
        lineType: "refill",
        deductMl: 100,
        bomNote: "Customer bottle · optional cap/collar/atomizer/pouch",
      },
    ]);
    flash("Refill 100ml — packaging charged separately if needed");
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  async function checkout() {
    if (cart.length === 0) return;
    if (!phone.trim()) {
      flash("Capture customer phone for marketing");
      return;
    }
    setCheckingOut(true);
    try {
      await api("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customerPhone: phone,
          payment,
          lines: cart.map((line) => ({
            productId: line.product.id,
            name: line.product.name,
            qty: line.qty,
            unitLabel: line.unitLabel,
            unitPrice: line.unitPrice,
            lineType: line.lineType,
            deductMl: line.deductMl,
            bomNote: line.bomNote,
          })),
        }),
      });
      flash(`Sale completed · ${formatMoney(subtotal)} · ${payment}`);
      setCart([]);
      setPhone("");
      setHeld(false);
      void reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not complete sale");
    } finally {
      setCheckingOut(false);
    }
  }

  if (loading) return <LoadingState label="Loading products…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="POS Terminal"
        description="Search products, quick buttons, remix BOM, oil-by-tola, refill, hold bill, and mixed payments — interactive prototype."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={addRemix}>
              <FlaskConical className="h-4 w-4" />
              Remix 100ml
            </Button>
            <Button variant="secondary" size="sm" onClick={addRefill}>
              <Droplets className="h-4 w-4" />
              Refill
            </Button>
          </>
        }
      />

      {toast ? (
        <div className="animate-fade-up mb-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm text-gold-deep">
          {toast}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Panel>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, SKU, or category…"
                className="h-11 w-full rounded-full border border-line bg-mist pr-3 pl-10 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              />
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Quick Buttons
              </p>
              <div className="flex flex-wrap gap-2">
                {quick.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (p.category === "Customized Perfumes") addRemix();
                      else if (p.unit === "ml") addOil(p, "tola");
                      else addReady(p);
                    }}
                    className="rounded-lg border border-line bg-mist/50 px-3 py-2 text-left text-sm transition hover:border-gold/50 hover:bg-mist"
                  >
                    <span className="block font-medium text-ink">{p.name}</span>
                    <span className="text-[11px] text-ink-muted">
                      {formatMoney(p.sellPrice)}
                      {p.unit === "ml" ? "/ml" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel padding={false}>
            <div className="border-b border-line/70 px-5 py-3">
              <p className="font-semibold text-lg text-ink">Catalog</p>
              <p className="text-xs text-ink-muted">
                {catalog.length} products · no barcode in Phase 1
              </p>
            </div>
            <div className="scrollbar-thin max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-mist/90 text-[11px] uppercase tracking-wider text-ink-muted backdrop-blur">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Product</th>
                    <th className="px-3 py-2.5 font-medium">Stock</th>
                    <th className="px-3 py-2.5 font-medium">Price</th>
                    <th className="px-5 py-2.5 text-right font-medium">Add</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((p) => {
                    const low = p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt;
                    return (
                      <tr key={p.id} className="border-t border-line/60">
                        <td className="px-5 py-3">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-[11px] text-ink-muted">
                            {p.sku} · {p.category}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={low ? "danger" : "success"}>
                            {p.stockSellable} {p.unit}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          {formatMoney(p.sellPrice)}
                          {p.unit === "ml" ? (
                            <span className="text-ink-muted">/ml</span>
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            {p.unit === "ml" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => addOil(p, "quarter_tola")}
                                >
                                  ¼
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => addOil(p, "half_tola")}
                                >
                                  ½
                                </Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => addOil(p, "tola")}
                                >
                                  1T
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" onClick={() => addReady(p)}>
                                <Plus className="h-3.5 w-3.5" />
                                Add
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel className="h-fit xl:sticky xl:top-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-xl text-ink">Current Bill</h2>
              <p className="text-xs text-ink-muted">
                {itemCount} items · {held ? "On hold" : "Active"}
              </p>
            </div>
            {held ? <Badge tone="warning">Held</Badge> : <Badge tone="success">Live</Badge>}
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink-muted">
              Customer phone (required)
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+971 …"
              className="mt-1.5 h-10 w-full rounded-full border border-line bg-mist px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
          </label>

          <div className="scrollbar-thin mt-4 max-h-64 space-y-2 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-mist/40 px-4 py-10 text-center text-sm text-ink-muted">
                Cart is empty — add products or remix
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.key}
                  className="rounded-lg border border-line/70 bg-mist/30 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{line.product.name}</p>
                      <p className="text-[11px] text-ink-muted">
                        {line.unitLabel} · {line.lineType}
                      </p>
                      {line.bomNote ? (
                        <p className="mt-1 text-[10px] text-sage">{line.bomNote}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-ink-muted hover:text-coral"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-mist"
                        onClick={() => updateQty(line.key, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-mist"
                        onClick={() => updateQty(line.key, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatMoney(line.qty * line.unitPrice)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 space-y-2 border-t border-line/70 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Subtotal</span>
              <span className="font-medium">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Tax</span>
              <span className="font-medium">—</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-lg">Total</span>
              <span className="font-semibold text-xl">{formatMoney(subtotal)}</span>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Payment
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {payments.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPayment(p.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] font-medium transition ${
                    payment === p.id
                      ? "border-ink bg-ink text-canvas"
                      : "border-line bg-mist text-ink-muted hover:border-line-strong"
                  }`}
                >
                  {p.icon}
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setHeld(true);
                flash("Bill held — resume anytime");
              }}
            >
              <Pause className="h-4 w-4" />
              Hold
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setHeld(false);
                flash("Bill resumed");
              }}
            >
              Resume
            </Button>
            <Button variant="secondary" onClick={() => flash("WhatsApp receipt queued")}>
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button variant="secondary" onClick={() => flash("Print job sent")}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>

          <Button
            className="mt-3 w-full"
            variant="gold"
            size="lg"
            disabled={cart.length === 0 || checkingOut}
            onClick={checkout}
          >
            {checkingOut ? "Completing…" : `Complete Sale · ${formatMoney(subtotal)}`}
          </Button>
        </Panel>
      </div>
    </div>
  );
}

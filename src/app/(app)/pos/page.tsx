"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  FileClock,
  FileText,
  Mail,
  Pause,
  Play,
  Printer,
  Search,
  Smartphone,
  Trash2,
  MessageCircle,
  Plus,
  Minus,
  Package,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { api } from "@/lib/api";
import { formatMoney, tolaToMl } from "@/lib/format";
import {
  fetchReceiptHtml,
  printHtmlDocument,
  printSaleReceipt,
} from "@/lib/receipt/print";
import type { ReceiptFormat } from "@/lib/receipt/types";
import { matchRemixRole } from "@/lib/sales/constants";
import type { AppSettings, PaymentMethod, Product } from "@/lib/types";

type CartLineType = "ready" | "remix" | "oil" | "refill" | "packaging";

type HeldSaleLine = {
  productId?: string;
  name: string;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  lineType: CartLineType;
  bomNote?: string;
  deductMl?: number;
  oilProductId?: string;
};

type HeldSale = {
  id: string;
  customerPhone: string;
  customerName?: string;
  salesperson: string;
  payment: string;
  status: string;
  total: number;
  saleType?: string;
  lines: HeldSaleLine[];
  time?: string;
  createdAt?: string;
};

type SendChannel = "email" | "whatsapp" | "sms";

type LastSale = {
  id: string;
  total: number;
  customerName: string;
  phone: string;
  email: string;
  payment: string;
};

type PackagingGroup = "bottle" | "cap" | "atomizer" | "collar" | "pouch" | "other";

const PACKAGING_GROUPS: {
  id: PackagingGroup;
  label: string;
}[] = [
  { id: "bottle", label: "Bottles" },
  { id: "cap", label: "Caps" },
  { id: "atomizer", label: "Atomizers" },
  { id: "collar", label: "Collars" },
  { id: "pouch", label: "Pouches" },
  { id: "other", label: "Other" },
];

function packagingGroupOf(product: Product): PackagingGroup {
  const role = matchRemixRole(product.name, product.sku);
  if (role === "bottle" || role === "cap" || role === "atomizer" || role === "collar") {
    return role;
  }
  if (/\bpouch\b/i.test(product.name) || /^PCH-/i.test(product.sku)) {
    return "pouch";
  }
  return "other";
}

type CartLine = {
  key: string;
  product: Product;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  lineType: CartLineType;
  deductMl?: number;
  bomNote?: string;
  oilProductId?: string;
  oilProductName?: string;
};
const emptyProducts: Product[] = [];

const payments: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: "cash", label: "Cash", icon: <Banknote className="h-4 w-4" /> },
  { id: "card", label: "Card", icon: <CreditCard className="h-4 w-4" /> },
  { id: "bank", label: "Bank", icon: <Banknote className="h-4 w-4" /> },
  { id: "credit", label: "Credit", icon: <FileClock className="h-4 w-4" /> },
  { id: "mixed", label: "Mixed", icon: <CreditCard className="h-4 w-4" /> },
];

const emptyHeld: HeldSale[] = [];

function normalizePayment(value: string | undefined): PaymentMethod {
  const raw = (value || "cash").toLowerCase();
  if (
    raw === "cash" ||
    raw === "card" ||
    raw === "bank" ||
    raw === "credit" ||
    raw === "mixed"
  ) {
    return raw;
  }
  return "cash";
}

function createIdempotencyKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function PosPage() {
  const { data: products, loading, error, reload } = useApiData<Product[]>("/api/products");
  const settings = useApiData<AppSettings>("/api/settings");
  const {
    data: heldBills,
    reload: reloadHeld,
    setData: setHeldBills,
  } = useApiData<HeldSale[]>("/api/sales?status=held&limit=50");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "err">("ok");
  const [checkingOut, setCheckingOut] = useState(false);
  const [holding, setHolding] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [remixOilId, setRemixOilId] = useState("");
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [packagingPick, setPackagingPick] = useState<
    Partial<Record<PackagingGroup, string>>
  >({});
  const inventory = products ?? emptyProducts;
  const heldList = heldBills ?? emptyHeld;
  const salespeople = useMemo(() => {
    if (settings.data?.salespeople?.length) return settings.data.salespeople;
    return settings.data?.currentUserName ? [settings.data.currentUserName] : [];
  }, [settings.data]);
  const salesperson = useMemo(() => {
    const active = (settings.data?.activeSalesperson || "").trim();
    if (active && salespeople.includes(active)) return active;
    return salespeople[0] || "";
  }, [settings.data?.activeSalesperson, salespeople]);

  const defaultFormat: ReceiptFormat =
    settings.data?.receiptFormat === "a4" ? "a4" : "thermal";
  const smsAvailable = Boolean(settings.data?.smsConfigured);

  const oilProducts = useMemo(
    () => inventory.filter((p) => p.unit === "ml" && p.category !== "Packaging"),
    [inventory],
  );

  const packagingProducts = useMemo(
    () =>
      inventory.filter(
        (p) =>
          p.category === "Packaging" &&
          p.unit !== "ml" &&
          !/ethanol|fixative/i.test(p.name),
      ),
    [inventory],
  );

  const packagingByGroup = useMemo(() => {
    const map = Object.fromEntries(
      PACKAGING_GROUPS.map((g) => [g.id, [] as Product[]]),
    ) as Record<PackagingGroup, Product[]>;
    for (const p of packagingProducts) {
      map[packagingGroupOf(p)].push(p);
    }
    return map;
  }, [packagingProducts]);

  const hasRefillInCart = cart.some((l) => l.lineType === "refill");

  function setPackagingForGroup(group: PackagingGroup, productId: string) {
    setPackagingPick((prev) => {
      const next = { ...prev };
      if (productId) next[group] = productId;
      else delete next[group];
      return next;
    });

    const items = packagingByGroup[group];
    const product = productId
      ? items.find((p) => p.id === productId)
      : undefined;

    setCart((prev) => {
      const withoutGroup = prev.filter(
        (l) =>
          !(
            l.lineType === "packaging" &&
            items.some((p) => p.id === l.product.id)
          ),
      );
      if (!product) return withoutGroup;
      return [
        ...withoutGroup,
        {
          key: `${product.id}-pkg-${Date.now()}`,
          product,
          qty: 1,
          unitLabel: product.unit,
          unitPrice: product.sellPrice,
          lineType: "packaging" as const,
          bomNote: "Optional refill packaging",
        },
      ];
    });
  }

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

  function flash(msg: string, ms = 2200, tone: "ok" | "err" = "ok") {
    setToastTone(tone);
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
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
    if (!remix) return flash("Create a customized perfume product first", 5000, "err");
    const oil = oilProducts.find((p) => p.id === remixOilId);
    if (!oil) {
      return flash("Oil not selected", 5000, "err");
    }
    setCart((prev) => [
      ...prev,
      {
        key: `remix-${Date.now()}`,
        product: remix,
        qty: 1,
        unitLabel: "pcs",
        unitPrice: remix.sellPrice,
        lineType: "remix",
        oilProductId: oil.id,
        oilProductName: oil.name,
        bomNote: `Selected oil: ${oil.name} (qty from formula)`,
      },
    ]);
    flash(`Remix added · oil ${oil.name}`);
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
    const oil = oilProducts.find((p) => p.id === remixOilId);
    if (!oil) {
      return flash("Oil not selected — pick oil for refill", 5000, "err");
    }
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
        bomNote: "Customer bottle · add Cap/Atomizer/etc. as packaging lines",
      },
    ]);
    flash("Refill 100ml — add optional packaging below if needed");
  }

  function updateQty(key: string, delta: number) {
    const line = cart.find((l) => l.key === key);
    const nextQty = line ? Math.max(0, line.qty + delta) : 0;
    if (line?.lineType === "packaging" && nextQty === 0) {
      const group = packagingGroupOf(line.product);
      setPackagingPick((prev) => {
        if (prev[group] !== line.product.id) return prev;
        const next = { ...prev };
        delete next[group];
        return next;
      });
    }
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function removeLine(key: string) {
    const line = cart.find((l) => l.key === key);
    if (line?.lineType === "packaging") {
      const group = packagingGroupOf(line.product);
      setPackagingPick((prev) => {
        if (prev[group] !== line.product.id) return prev;
        const next = { ...prev };
        delete next[group];
        return next;
      });
    }
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  async function checkout() {
    if (cart.length === 0) return;
    if (!salesperson) {
      flash("Set active salesperson in Settings → Sales Team", 6000, "err");
      return;
    }
    if (!phone.trim()) {
      flash("Capture customer phone for marketing", 5000, "err");
      return;
    }
    const missingOil = cart.some(
      (l) => l.lineType === "remix" && !l.oilProductId,
    );
    if (missingOil) {
      flash("Oil not selected for remix line", 5000, "err");
      return;
    }
    setCheckingOut(true);
    const idempotencyKey = createIdempotencyKey();
    const snapshot = {
      cart,
      packagingPick,
      customerName: customerName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      payment,
      subtotal,
    };
    // Clear cart immediately (same feel as Hold) — restore if save fails
    setCart([]);
    setPackagingPick({});
    setCustomerName("");
    setPhone("");
    setEmail("");
    try {
      const sale = await api<{ id: string; total?: number }>("/api/sales", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          customerPhone: snapshot.phone,
          customerName: snapshot.customerName || undefined,
          salesperson,
          payment: snapshot.payment,
          idempotencyKey,
          lines: snapshot.cart.map((line) => ({
            productId: line.product.id,
            name: line.product.name,
            qty: line.qty,
            unitLabel: line.unitLabel,
            unitPrice: line.unitPrice,
            lineType: line.lineType,
            deductMl: line.deductMl,
            bomNote: line.bomNote,
            oilProductId: line.oilProductId,
          })),
        }),
      });
      const completed: LastSale = {
        id: sale.id,
        total: sale.total ?? snapshot.subtotal,
        customerName: snapshot.customerName,
        phone: snapshot.phone,
        email: snapshot.email,
        payment: snapshot.payment,
      };
      setLastSale(completed);
      flash(`Sale completed · ${formatMoney(snapshot.subtotal)} · ${snapshot.payment}`);
      void reloadHeld();
      if (settings.data?.autoPrintReceipt !== false) {
        void printSale(completed, defaultFormat, false);
      }
      window.setTimeout(() => void reload(), 2500);
    } catch (err) {
      setCart(snapshot.cart);
      setPackagingPick(snapshot.packagingPick);
      setCustomerName(snapshot.customerName);
      setPhone(snapshot.phone);
      setEmail(snapshot.email);
      setPayment(snapshot.payment);
      flash(err instanceof Error ? err.message : "Could not complete sale", 6000, "err");
    } finally {
      setCheckingOut(false);
    }
  }

  function stubProductFromLine(line: HeldSaleLine): Product {
    const pid = line.productId ? String(line.productId) : `missing-${line.name}`;
    return {
      id: pid,
      sku: "—",
      name: line.name,
      category: "Brand Perfumes",
      unit: line.lineType === "oil" || line.lineType === "refill" ? "ml" : "pcs",
      sellPrice: line.unitPrice,
      minMarginPct: 0,
      costFifo: 0,
      stockSellable: 0,
      stockTester: 0,
      stockSample: 0,
      stockPersonal: 0,
      lowStockAt: 0,
    };
  }

  function cartFromHeld(sale: HeldSale): {
    lines: CartLine[];
    packaging: Partial<Record<PackagingGroup, string>>;
  } {
    const packaging: Partial<Record<PackagingGroup, string>> = {};
    const lines: CartLine[] = (sale.lines || []).map((line, index) => {
      const productId = line.productId ? String(line.productId) : "";
      const product =
        (productId && inventory.find((p) => p.id === productId)) ||
        stubProductFromLine(line);
      const oilId = line.oilProductId ? String(line.oilProductId) : undefined;
      const oilProduct = oilId
        ? inventory.find((p) => p.id === oilId)
        : undefined;

      if (line.lineType === "packaging" && productId) {
        packaging[packagingGroupOf(product)] = productId;
      }

      return {
        key: `held-${sale.id}-${index}-${Date.now()}`,
        product,
        qty: line.qty,
        unitLabel: line.unitLabel,
        unitPrice: line.unitPrice,
        lineType: line.lineType,
        deductMl: line.deductMl,
        bomNote: line.bomNote,
        oilProductId: oilId,
        oilProductName: oilProduct?.name,
      };
    });
    return { lines, packaging };
  }

  async function holdBill() {
    if (cart.length === 0) {
      flash("Cart is empty — nothing to hold", 4000, "err");
      return;
    }
    if (!phone.trim()) {
      flash("Capture customer phone before holding the bill", 5000, "err");
      return;
    }
    if (!salesperson) {
      flash("Set active salesperson in Settings → Sales Team", 6000, "err");
      return;
    }
    setHolding(true);
    const snapshot = {
      customerName: customerName.trim(),
      phone: phone.trim(),
      payment,
      salesperson,
      email,
      cart,
      packagingPick,
    };
    // Clear terminal immediately so the cashier feels instant feedback
    setCart([]);
    setPackagingPick({});
    setCustomerName("");
    setPhone("");
    setEmail("");
    try {
      const held = await api<HeldSale>("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customerPhone: snapshot.phone,
          customerName: snapshot.customerName || undefined,
          salesperson: snapshot.salesperson,
          payment: snapshot.payment,
          status: "held",
          lines: snapshot.cart.map((line) => ({
            productId: line.product.id,
            name: line.product.name,
            qty: line.qty,
            unitLabel: line.unitLabel,
            unitPrice: line.unitPrice,
            lineType: line.lineType,
            deductMl: line.deductMl,
            bomNote: line.bomNote,
            oilProductId: line.oilProductId,
          })),
        }),
      });
      setHeldBills((prev) => [held, ...(prev ?? [])]);
      flash("Bill held — resume anytime");
    } catch (err) {
      // Restore cart if save failed
      setCart(snapshot.cart);
      setPackagingPick(snapshot.packagingPick);
      setCustomerName(snapshot.customerName);
      setPhone(snapshot.phone);
      setEmail(snapshot.email);
      flash(err instanceof Error ? err.message : "Could not hold bill", 6000, "err");
    } finally {
      setHolding(false);
    }
  }

  async function resumeHeld(sale: HeldSale) {
    if (cart.length > 0) {
      flash("Hold or clear the current bill before resuming another", 5000, "err");
      return;
    }
    setResumingId(sale.id);
    const { lines, packaging } = cartFromHeld(sale);
    if (lines.length === 0) {
      setResumingId(null);
      flash("Held bill has no lines", 4000, "err");
      return;
    }
    // Optimistic: restore cart + drop from held list immediately
    setCart(lines);
    setPackagingPick(packaging);
    setCustomerName(
      sale.customerName && sale.customerName !== "Walk-in Customer"
        ? sale.customerName
        : "",
    );
    setPhone(
      sale.customerPhone && sale.customerPhone !== "pending"
        ? sale.customerPhone
        : "",
    );
    setPayment(normalizePayment(sale.payment));
    setHeldBills((prev) => (prev ?? []).filter((s) => s.id !== sale.id));
    try {
      await api(`/api/sales/${sale.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "void" }),
      });
      flash(`Resumed bill · ${formatMoney(sale.total)}`);
    } catch (err) {
      setCart([]);
      setPackagingPick({});
      setCustomerName("");
      setPhone("");
      setHeldBills((prev) => [sale, ...(prev ?? []).filter((s) => s.id !== sale.id)]);
      flash(err instanceof Error ? err.message : "Could not resume bill", 6000, "err");
    } finally {
      setResumingId(null);
    }
  }

  async function discardHeld(sale: HeldSale) {
    setDiscardingId(sale.id);
    setHeldBills((prev) => (prev ?? []).filter((s) => s.id !== sale.id));
    try {
      await api(`/api/sales/${sale.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "void" }),
      });
      flash("Held bill discarded");
    } catch (err) {
      setHeldBills((prev) => [sale, ...(prev ?? []).filter((s) => s.id !== sale.id)]);
      flash(
        err instanceof Error ? err.message : "Could not discard bill",
        6000,
        "err",
      );
    } finally {
      setDiscardingId(null);
    }
  }

  function receiptLines() {
    return cart.map((line) => ({
      name: line.product.name,
      qty: line.qty,
      unitLabel: line.unitLabel,
      unitPrice: line.unitPrice,
      note: line.oilProductName ? `Oil: ${line.oilProductName}` : undefined,
    }));
  }

  async function printSale(
    sale: LastSale,
    format: ReceiptFormat,
    reprint: boolean,
  ) {
    setReceiptBusy(`print-${format}`);
    try {
      await printSaleReceipt(sale.id, format, { reprint });
      void api("/api/notifications/log", {
        method: "POST",
        body: JSON.stringify({
          channel: "print",
          kind: "receipt",
          status: "printed",
          saleId: sale.id,
          format,
        }),
      }).catch(() => undefined);
      flash(
        `Receipt sent to printer · ${format === "a4" ? "A4" : "80mm thermal"}`,
      );
    } catch (err) {
      flash(
        err instanceof Error ? err.message : "Could not print receipt",
        7000,
        "err",
      );
    } finally {
      setReceiptBusy(null);
    }
  }

  async function printDraftBill(format: ReceiptFormat) {
    if (cart.length === 0) {
      flash("Cart is empty — nothing to print", 4000, "err");
      return;
    }
    setReceiptBusy(`print-${format}`);
    try {
      const html = await fetchReceiptHtml("/api/receipts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          customerName: customerName.trim(),
          customerPhone: phone.trim(),
          salesperson,
          payment,
          total: subtotal,
          lines: receiptLines(),
        }),
      });
      await printHtmlDocument(html);
      flash("Draft bill sent to printer");
    } catch (err) {
      flash(
        err instanceof Error ? err.message : "Could not print draft bill",
        7000,
        "err",
      );
    } finally {
      setReceiptBusy(null);
    }
  }

  function printCurrent(format: ReceiptFormat) {
    if (cart.length > 0) {
      void printDraftBill(format);
      return;
    }
    if (lastSale) {
      void printSale(lastSale, format, true);
      return;
    }
    flash("Add items or complete a sale first", 4000, "err");
  }

  async function sendReceipt(channels: SendChannel[]) {
    const target = cart.length === 0 ? lastSale : null;
    const toPhone = target ? target.phone : phone.trim();
    const toEmail = target ? target.email : email.trim();

    if (!target && cart.length === 0) {
      flash("Add items or complete a sale first", 4000, "err");
      return;
    }
    if (!toPhone) {
      flash("Customer phone is required", 5000, "err");
      return;
    }
    if (channels.includes("email") && !toEmail) {
      flash("Add a customer email to send the receipt by email", 6000, "err");
      return;
    }

    setReceiptBusy(channels.join("+"));
    try {
      const res = await api<{
        receiptNo?: string;
        whatsapp?: { ok: boolean; url?: string; error?: string };
        email?: { ok: boolean; to?: string; error?: string };
        sms?: { ok: boolean; to?: string; error?: string };
      }>("/api/notifications/send", {
        method: "POST",
        body: JSON.stringify({
          channels,
          kind: "receipt",
          saleId: target?.id,
          toPhone,
          toEmail: toEmail || undefined,
          customerName: target ? target.customerName : customerName.trim(),
          salesperson,
          payment: target ? target.payment : payment,
          total: target ? target.total : subtotal,
          lines: target ? undefined : receiptLines(),
        }),
      });

      if (res.whatsapp?.url) {
        window.open(res.whatsapp.url, "_blank", "noopener,noreferrer");
      }

      const done = [
        res.email?.ok ? `Email → ${res.email.to}` : null,
        res.whatsapp?.ok ? "WhatsApp opened" : null,
        res.sms?.ok ? `SMS → ${res.sms.to}` : null,
      ].filter(Boolean);
      flash(
        `${res.receiptNo ? `${res.receiptNo} · ` : ""}${done.join(" · ")}`,
        6000,
      );
    } catch (err) {
      flash(
        err instanceof Error ? err.message : "Could not send receipt",
        8000,
        "err",
      );
    } finally {
      setReceiptBusy(null);
    }
  }

  if (loading || settings.loading) return <LoadingState label="Loading POS…" />;
  if (error || settings.error) {
    return (
      <ErrorState
        message={error || settings.error || "Failed to load POS"}
        onRetry={() => {
          void reload();
          void settings.reload();
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="POS Terminal"
        description="Search products, quick buttons, remix BOM, oil-by-tola, refill, hold/resume bills (saved), and mixed payments."
      />

      {toast ? (
        <div
          className={`animate-fade-up mb-4 rounded-lg border px-4 py-2.5 text-sm ${
            toastTone === "err"
              ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
              : "border-gold/30 bg-gold/10 text-gold-deep"
          }`}
        >
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

            {packagingProducts.length > 0 ? (
              <div
                className={`mt-4 rounded-xl border bg-paper px-4 py-3.5 transition ${
                  hasRefillInCart ? "border-line-strong" : "border-line"
                }`}
              >
                <div className="mb-3 flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-mist text-ink-soft">
                    <Package className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">
                        Optional packaging
                      </p>
                      <Badge tone={hasRefillInCart ? "warning" : "neutral"}>
                        {hasRefillInCart ? "Suggested for refill" : "Optional"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Choose from the dropdowns below for refill sales.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {PACKAGING_GROUPS.map((group) => {
                    const items = packagingByGroup[group.id];
                    if (items.length === 0) return null;
                    const selectedId = packagingPick[group.id] ?? "";
                    return (
                      <label key={group.id} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                          {group.label}
                        </span>
                        <select
                          value={selectedId}
                          onChange={(e) =>
                            setPackagingForGroup(group.id, e.target.value)
                          }
                          className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                        >
                          <option value="">
                            Select {group.label.toLowerCase()}…
                          </option>
                          {items.map((p) => {
                            const out = p.stockSellable <= 0;
                            return (
                              <option
                                key={p.id}
                                value={p.id}
                                disabled={out && p.id !== selectedId}
                              >
                                {p.name} · {formatMoney(p.sellPrice)}
                                {out ? " — out" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
                {itemCount} items · {heldList.length} held
              </p>
            </div>
            <Badge tone={cart.length > 0 ? "success" : "neutral"}>
              {cart.length > 0 ? "Live" : "Idle"}
            </Badge>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink-muted">
              Customer name
            </span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="mt-1.5 h-10 w-full rounded-full border border-line bg-mist px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
          </label>

          <label className="mt-3 block">
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

          <label className="mt-3 block">
            <span className="text-xs font-medium text-ink-muted">
              Customer email (for emailed receipt)
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@email.com"
              className="mt-1.5 h-10 w-full rounded-full border border-line bg-mist px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
          </label>

          <div className="mt-3 rounded-lg border border-line/70 bg-mist/40 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Active salesperson
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {salesperson || "Not set — open Settings → Sales Team"}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">
              Change this from Settings only (locked on POS).
            </p>
          </div>

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
                        {line.oilProductName ? ` · oil: ${line.oilProductName}` : ""}
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
              disabled={cart.length === 0 || holding || checkingOut}
              onClick={() => void holdBill()}
            >
              <Pause className="h-4 w-4" />
              {holding ? "Holding…" : "Hold"}
            </Button>
            <Button
              variant="secondary"
              disabled={heldList.length === 0 || cart.length > 0 || !!resumingId}
              onClick={() => {
                if (heldList[0]) void resumeHeld(heldList[0]);
              }}
            >
              <Play className="h-4 w-4" />
              {resumingId === heldList[0]?.id ? "Resuming…" : "Resume latest"}
            </Button>
          </div>

          <div className="mt-4 border-t border-line/70 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Receipt delivery
              </p>
              <Badge tone={cart.length > 0 ? "warning" : lastSale ? "success" : "neutral"}>
                {cart.length > 0
                  ? "Draft bill"
                  : lastSale
                    ? "Last sale"
                    : "No bill"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={receiptBusy !== null}
                onClick={() => printCurrent("thermal")}
              >
                <Printer className="h-4 w-4" />
                {receiptBusy === "print-thermal" ? "Printing…" : "Print 80mm"}
              </Button>
              <Button
                variant="secondary"
                disabled={receiptBusy !== null}
                onClick={() => printCurrent("a4")}
              >
                <FileText className="h-4 w-4" />
                {receiptBusy === "print-a4" ? "Printing…" : "A4 / PDF"}
              </Button>
              <Button
                variant="secondary"
                disabled={receiptBusy !== null}
                onClick={() => void sendReceipt(["whatsapp"])}
              >
                <MessageCircle className="h-4 w-4" />
                {receiptBusy === "whatsapp" ? "Opening…" : "WhatsApp"}
              </Button>
              <Button
                variant="secondary"
                disabled={receiptBusy !== null}
                onClick={() => void sendReceipt(["email"])}
              >
                <Mail className="h-4 w-4" />
                {receiptBusy === "email" ? "Sending…" : "Email"}
              </Button>
              <Button
                variant="secondary"
                disabled={receiptBusy !== null || !smsAvailable}
                title={
                  smsAvailable
                    ? undefined
                    : "Set SMS_PROVIDER and Twilio keys to enable SMS"
                }
                onClick={() => void sendReceipt(["sms"])}
              >
                <Smartphone className="h-4 w-4" />
                {receiptBusy === "sms" ? "Sending…" : "SMS"}
              </Button>
              <Button
                variant="secondary"
                disabled={receiptBusy !== null}
                onClick={() =>
                  void sendReceipt(
                    smsAvailable
                      ? ["whatsapp", "email", "sms"]
                      : ["whatsapp", "email"],
                  )
                }
              >
                Send all
              </Button>
            </div>

            <p className="mt-2 text-[11px] text-ink-muted">
              {cart.length > 0
                ? "Live cart prints as a draft bill. Complete the sale for a numbered receipt."
                : lastSale
                  ? `Last sale ${formatMoney(lastSale.total)} · ${lastSale.phone || "no phone"} — reprints are marked REPRINT.`
                  : "Complete a sale to print or send a numbered receipt."}
              {smsAvailable ? "" : " SMS is off until Twilio keys are set."}
            </p>
          </div>

          {heldList.length > 0 ? (
            <div className="mt-4 border-t border-line/70 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Held bills
                </p>
                <Badge tone="warning">{heldList.length}</Badge>
              </div>
              <div className="scrollbar-thin max-h-48 space-y-2 overflow-y-auto">
                {heldList.map((sale) => {
                  const lineCount = sale.lines?.length ?? 0;
                  const busy =
                    resumingId === sale.id || discardingId === sale.id;
                  return (
                    <div
                      key={sale.id}
                      className="rounded-lg border border-line/70 bg-mist/30 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {sale.customerName &&
                            sale.customerName !== "Walk-in Customer"
                              ? sale.customerName
                              : sale.customerPhone || "No phone"}
                          </p>
                          <p className="text-[11px] text-ink-muted">
                            {sale.customerName &&
                            sale.customerName !== "Walk-in Customer"
                              ? `${sale.customerPhone || "No phone"} · `
                              : ""}
                            {sale.time || "—"} · {lineCount} line
                            {lineCount === 1 ? "" : "s"} ·{" "}
                            {formatMoney(sale.total)}
                          </p>
                          <p className="text-[11px] text-ink-muted">
                            Salesperson: {sale.salesperson || "Not assigned"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void discardHeld(sale)}
                          className="text-ink-muted hover:text-coral disabled:opacity-40"
                          title="Discard held bill"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Button
                        className="mt-2 w-full"
                        size="sm"
                        variant="secondary"
                        disabled={cart.length > 0 || busy}
                        onClick={() => void resumeHeld(sale)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        {resumingId === sale.id ? "Resuming…" : "Resume"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <Button
            className="mt-3 w-full"
            variant="gold"
            size="lg"
            disabled={cart.length === 0 || checkingOut || holding}
            onClick={checkout}
          >
            {checkingOut ? "Completing…" : `Complete Sale · ${formatMoney(subtotal)}`}
          </Button>
        </Panel>
      </div>
    </div>
  );
}

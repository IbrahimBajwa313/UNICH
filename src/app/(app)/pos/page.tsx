"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
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
import { buildWhatsAppUrl } from "@/lib/notifications/whatsapp";
import { buildReceiptDoc } from "@/lib/receipt/document";
import {
  fetchReceiptHtml,
  printHtmlDocument,
  printSaleReceipt,
} from "@/lib/receipt/print";
import { receiptText } from "@/lib/receipt/text";
import type { ReceiptFormat, ReceiptLine } from "@/lib/receipt/types";
import { matchRemixRole } from "@/lib/sales/constants";
import type { AppSettings, Customer, PaymentMethod, Product } from "@/lib/types";

type CatalogFilter = "all" | "ready" | "oil" | "custom";

const CATALOG_FILTERS: { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "oil", label: "Oils" },
  { id: "custom", label: "Remix" },
];

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

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
  salesperson: string;
  lines: ReceiptLine[];
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
  const {
    data: products,
    loading,
    error,
    reload,
    setData: setProducts,
  } = useApiData<Product[]>("/api/products");
  const settings = useApiData<AppSettings>("/api/settings");
  const {
    data: heldBills,
    reload: reloadHeld,
    setData: setHeldBills,
  } = useApiData<HeldSale[]>("/api/sales?status=held&limit=50");
  const searchRef = useRef<HTMLInputElement>(null);
  const phoneLookupSeq = useRef(0);
  const [query, setQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const [toolStrip, setToolStrip] = useState<"packaging" | "quick">("quick");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [customerMatch, setCustomerMatch] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "err">("ok");
  const [checkingOut, setCheckingOut] = useState(false);
  const [holding, setHolding] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [switchingSalesperson, setSwitchingSalesperson] = useState(false);
  const [remixOilId, setRemixOilId] = useState("");
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [saleDoneOpen, setSaleDoneOpen] = useState(false);
  /** Cashier opt-in only — never print unless this box is checked. */
  const [printAfterComplete, setPrintAfterComplete] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [heldMenuOpen, setHeldMenuOpen] = useState(false);
  const sendInFlight = useRef(new Set<string>());
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
  const vatPercent = Math.max(0, Number(settings.data?.vatPercent ?? 0));

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

  useEffect(() => {
    if (hasRefillInCart) setToolStrip("packaging");
  }, [hasRefillInCart]);

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
    return inventory.filter((p) => {
      if (p.category === "Packaging") return false;
      if (catalogFilter === "oil" && p.unit !== "ml") return false;
      if (catalogFilter === "custom" && p.category !== "Customized Perfumes") {
        return false;
      }
      if (
        catalogFilter === "ready" &&
        (p.unit === "ml" || p.category === "Customized Perfumes")
      ) {
        return false;
      }
      if (q === "") return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [inventory, query, catalogFilter]);

  const quick = inventory.filter((p) => p.isQuickButton);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const vatAmount =
    vatPercent > 0 ? round2(subtotal - subtotal / (1 + vatPercent / 100)) : 0;
  const netAmount = round2(subtotal - vatAmount);
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const digits = digitsOnly(phone);
    if (digits.length < 7) {
      setCustomerMatch(null);
      return;
    }
    const seq = ++phoneLookupSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const list = await api<Customer[]>(
          `/api/customers?q=${encodeURIComponent(phone.trim())}`,
        );
        if (seq !== phoneLookupSeq.current) return;
        const match =
          list.find((c) => digitsOnly(c.phone) === digits) ||
          list.find((c) => {
            const pd = digitsOnly(c.phone);
            return pd.endsWith(digits) || digits.endsWith(pd);
          });
        if (match) {
          setCustomerMatch(match.name);
          setCustomerName(match.name);
          setEmail(match.email?.trim() || "");
        } else {
          setCustomerMatch(null);
        }
      } catch {
        if (seq === phoneLookupSeq.current) setCustomerMatch(null);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [phone]);

  function flash(msg: string, ms = 2200, tone: "ok" | "err" = "ok") {
    setToastTone(tone);
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }

  async function switchSalesperson(name: string) {
    if (!settings.data || name === salesperson) return;
    setSwitchingSalesperson(true);
    try {
      const updated = await api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...settings.data,
          activeSalesperson: name,
        }),
      });
      settings.setData(updated);
      flash(`Salesperson · ${name}`);
    } catch (err) {
      flash(
        err instanceof Error ? err.message : "Could not switch salesperson",
        6000,
        "err",
      );
    } finally {
      setSwitchingSalesperson(false);
    }
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

  function addProductSmart(product: Product) {
    if (product.stockSellable <= 0) {
      flash(`${product.name} is out of stock`, 4000, "err");
      return;
    }
    if (product.category === "Customized Perfumes") {
      addRemix();
      return;
    }
    if (product.unit === "ml") {
      addOil(product, "tola");
      return;
    }
    addReady(product);
  }

  /** Instant catalog stock update after sale — avoids waiting on full reload. */
  function applyLocalStockDeduction(lines: CartLine[]) {
    const delta = new Map<string, number>();
    for (const line of lines) {
      if (line.lineType === "ready" || line.lineType === "packaging") {
        delta.set(
          line.product.id,
          (delta.get(line.product.id) || 0) + line.qty,
        );
      } else if (
        (line.lineType === "oil" || line.lineType === "refill") &&
        line.deductMl
      ) {
        delta.set(
          line.product.id,
          (delta.get(line.product.id) || 0) + line.deductMl * line.qty,
        );
      }
      // remix BOM components refresh via silent API reload
    }
    if (delta.size === 0) return;
    setProducts((prev) => {
      if (!prev) return prev;
      return prev.map((p) => {
        const cut = delta.get(p.id);
        if (!cut) return p;
        return {
          ...p,
          stockSellable: Math.max(0, p.stockSellable - cut),
        };
      });
    });
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
      salesperson,
      subtotal,
    };
    // Clear cart immediately (same feel as Hold) — restore if save fails
    setCart([]);
    setPackagingPick({});
    setCustomerName("");
    setPhone("");
    setEmail("");
    setCustomerMatch(null);
    try {
      const sale = await api<{ id: string; total?: number }>("/api/sales", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          customerPhone: snapshot.phone,
          customerName: snapshot.customerName || undefined,
          salesperson: snapshot.salesperson,
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
        salesperson: snapshot.salesperson,
        lines: snapshot.cart.map((line) => ({
          name: line.product.name,
          qty: line.qty,
          unitLabel: line.unitLabel,
          unitPrice: line.unitPrice,
        })),
      };
      setLastSale(completed);
      setSaleDoneOpen(true);
      flash(`Sale completed · ${formatMoney(snapshot.subtotal)} · ${snapshot.payment}`);
      // Soft stock refresh — silent so POS does not flash "Loading…"
      applyLocalStockDeduction(snapshot.cart);
      void reloadHeld({ silent: true });
      // Print ONLY if cashier checked "Print after complete" (never automatic).
      if (printAfterComplete) {
        void printSale(completed, defaultFormat, false);
      }
      void reload({ silent: true });
      window.setTimeout(() => searchRef.current?.focus(), 100);
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

  const checkoutRef = useRef(checkout);
  checkoutRef.current = checkout;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        void checkoutRef.current();
        return;
      }
      if (e.key === "Escape") {
        if (saleDoneOpen) {
          e.preventDefault();
          setSaleDoneOpen(false);
          return;
        }
        if (toast) {
          e.preventDefault();
          setToast(null);
        }
        return;
      }
      if (!typing && e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saleDoneOpen, toast]);

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
    setCustomerMatch(null);
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

  function buildPosReceiptDoc(target: LastSale | null) {
    const lines = target?.lines?.length ? target.lines : receiptLines();
    return buildReceiptDoc({
      saleId: target?.id,
      draft: !target,
      customer: {
        name: target ? target.customerName : customerName.trim(),
        phone: target ? target.phone : phone.trim(),
        email: target ? target.email : email.trim(),
      },
      salesperson: target?.salesperson || salesperson,
      payment: target ? target.payment : payment,
      lines,
      total: target ? target.total : subtotal,
      settings: settings.data ?? undefined,
    });
  }

  async function sendReceipt(channels: SendChannel[]) {
    const target = cart.length === 0 ? lastSale : null;
    const toPhone = target ? target.phone : phone.trim();
    const toEmail = target ? target.email : email.trim();
    const lines = target?.lines?.length ? target.lines : receiptLines();
    const flightKey = `${target?.id || "draft"}:${channels.join("+")}`;

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
    if (sendInFlight.current.has(flightKey)) return;
    sendInFlight.current.add(flightKey);

    const done: string[] = [];
    let receiptNo = "";
    let background = false;

    try {
      if (channels.includes("whatsapp")) {
        try {
          const doc = buildPosReceiptDoc(target);
          receiptNo = doc.receiptNo;
          window.open(
            buildWhatsAppUrl(toPhone, receiptText(doc)),
            "_blank",
            "noopener,noreferrer",
          );
          done.push("WhatsApp opened");
          void api("/api/notifications/log", {
            method: "POST",
            body: JSON.stringify({
              channel: "whatsapp",
              kind: "receipt",
              status: "handoff",
              saleId: target?.id,
              receiptNo: doc.receiptNo,
              to: toPhone,
            }),
          }).catch(() => {
            /* non-fatal */
          });
        } catch (err) {
          flash(
            err instanceof Error ? err.message : "Could not open WhatsApp",
            6000,
            "err",
          );
        }
      }

      const remoteChannels = channels.filter((c) => c !== "whatsapp");
      if (remoteChannels.length === 0) {
        if (done.length > 0) {
          flash(
            `${receiptNo ? `${receiptNo} · ` : ""}${done.join(" · ")}`,
            4000,
          );
        }
        return;
      }

      // Email / SMS save in background — no spinner, toast only when finished.
      background = true;
      void (async () => {
        try {
          const res = await api<{
            receiptNo?: string;
            email?: { ok: boolean; to?: string; error?: string };
            sms?: { ok: boolean; to?: string; error?: string };
          }>("/api/notifications/send", {
            method: "POST",
            body: JSON.stringify({
              channels: remoteChannels,
              kind: "receipt",
              saleId: target?.id,
              toPhone,
              toEmail: toEmail || undefined,
              customerName: target ? target.customerName : customerName.trim(),
              salesperson: target?.salesperson || salesperson,
              payment: target ? target.payment : payment,
              total: target ? target.total : subtotal,
              lines,
            }),
          });

          const parts = [
            ...done,
            res.email?.ok ? `Email → ${res.email.to}` : null,
            res.sms?.ok ? `SMS → ${res.sms.to}` : null,
          ].filter(Boolean);
          const no = res.receiptNo || receiptNo;
          flash(`${no ? `${no} · ` : ""}${parts.join(" · ")}`, 6000);
        } catch (err) {
          flash(
            err instanceof Error ? err.message : "Could not send receipt",
            8000,
            "err",
          );
        } finally {
          sendInFlight.current.delete(flightKey);
        }
      })();
    } catch (err) {
      flash(
        err instanceof Error ? err.message : "Could not send receipt",
        8000,
        "err",
      );
    } finally {
      if (!background) sendInFlight.current.delete(flightKey);
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
        title="POS Terminal"
        description="F2 search · Enter add · F9 complete · phone autofills known customers."
        className="!mb-3"
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

      <div className="grid gap-5 xl:h-[calc(100vh-7.5rem)] xl:grid-cols-[1.45fr_1fr] xl:items-stretch">
        {/* LEFT: search → big catalog grid → bottom tools */}
        <div className="flex min-h-0 flex-col gap-3">
          <Panel className="shrink-0 !p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const first = catalog[0];
                  if (!first) {
                    flash("No products match this search", 3000, "err");
                    return;
                  }
                  addProductSmart(first);
                  setQuery("");
                }}
                placeholder="Search name, SKU, category, barcode… · Enter to add"
                className="h-11 w-full rounded-full border border-line bg-mist pr-3 pl-10 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CATALOG_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCatalogFilter(f.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    catalogFilter === f.id
                      ? "border-ink bg-ink text-canvas"
                      : "border-line bg-mist text-ink-muted hover:border-line-strong"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="ml-auto self-center text-[11px] text-ink-muted">
                {catalog.length} products
              </span>
            </div>
          </Panel>

          <Panel
            padding={false}
            className="flex min-h-[280px] flex-1 flex-col overflow-hidden"
          >
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {catalog.length === 0 ? (
                <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-ink-muted">
                  No products in this filter
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                  {catalog.map((p) => {
                    const low =
                      p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt;
                    const out = p.stockSellable <= 0;
                    return (
                      <div
                        key={p.id}
                        className={`flex flex-col rounded-xl border border-line/70 bg-mist/25 p-3 transition hover:border-gold/40 hover:bg-mist/40 ${
                          out ? "opacity-50" : ""
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <Badge
                            tone={out ? "danger" : low ? "warning" : "success"}
                            className="h-5 max-w-full truncate px-2 text-[10px]"
                          >
                            {out
                              ? "Out"
                              : `${p.stockSellable} ${p.unit}`}
                          </Badge>
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink">
                            {formatMoney(p.sellPrice)}
                            {p.unit === "ml" ? (
                              <span className="font-normal text-ink-muted">
                                /ml
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                          {p.name}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-ink-muted">
                          {p.sku} · {p.category}
                        </p>
                        <div className="mt-auto flex gap-1.5 pt-3">
                          {p.unit === "ml" ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 flex-1 px-0"
                                disabled={out}
                                title={out ? "Out of stock" : "¼ tola"}
                                onClick={() => addOil(p, "quarter_tola")}
                              >
                                ¼
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 flex-1 px-0"
                                disabled={out}
                                title={out ? "Out of stock" : "½ tola"}
                                onClick={() => addOil(p, "half_tola")}
                              >
                                ½
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                className="h-8 flex-1 px-0"
                                disabled={out}
                                title={out ? "Out of stock" : "1 tola"}
                                onClick={() => addOil(p, "tola")}
                              >
                                1T
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 w-full"
                              disabled={out}
                              title={out ? "Out of stock" : undefined}
                              onClick={() =>
                                p.category === "Customized Perfumes"
                                  ? addRemix()
                                  : addReady(p)
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {out ? "Out" : "Add"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          {/* Bottom tool strip: Packaging | Quick Add */}
          <Panel className="shrink-0 !p-3">
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "quick" as const, label: "Quick Add" },
                  { id: "packaging" as const, label: "Packaging" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setToolStrip(tab.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    toolStrip === tab.id
                      ? "border-ink bg-ink text-canvas"
                      : "border-line bg-mist text-ink-muted hover:border-line-strong"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {toolStrip === "packaging" && hasRefillInCart ? (
                <Badge tone="warning">Suggested for refill</Badge>
              ) : null}
            </div>

            {toolStrip === "quick" ? (
              <div className="flex flex-wrap gap-1.5">
                {quick.length === 0 ? (
                  <p className="text-xs text-ink-muted">
                    No quick-button products configured
                  </p>
                ) : (
                  quick.map((p) => {
                    const out = p.stockSellable <= 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={out}
                        title={out ? "Out of stock" : undefined}
                        onClick={() => {
                          if (p.category === "Customized Perfumes") addRemix();
                          else if (p.unit === "ml") addOil(p, "tola");
                          else addReady(p);
                        }}
                        className="rounded-lg border border-line bg-mist/50 px-2.5 py-1.5 text-left text-xs transition hover:border-gold/50 hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="block font-medium text-ink">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          {out
                            ? "Out"
                            : `${formatMoney(p.sellPrice)}${p.unit === "ml" ? "/ml" : ""}`}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : packagingProducts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PACKAGING_GROUPS.map((group) => {
                  const items = packagingByGroup[group.id];
                  if (items.length === 0) return null;
                  const selectedId = packagingPick[group.id] ?? "";
                  return (
                    <label key={group.id} className="block min-w-0">
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                        <Package className="h-3 w-3" />
                        {group.label}
                      </span>
                      <select
                        value={selectedId}
                        onChange={(e) =>
                          setPackagingForGroup(group.id, e.target.value)
                        }
                        className="h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-xs text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
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
            ) : (
              <p className="text-xs text-ink-muted">No packaging products</p>
            )}
          </Panel>
        </div>

        <Panel className="flex min-h-0 flex-col overflow-hidden !p-4 xl:h-[calc(100vh-7.5rem)] xl:sticky xl:top-[4.5rem]">
          {/* Fixed header */}
          <div className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold text-lg text-ink">Current Bill</h2>
                <p className="text-[11px] text-ink-muted">
                  {itemCount} items · {heldList.length} held
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {salespeople.length > 0 ? (
                  <select
                    value={salesperson}
                    disabled={switchingSalesperson}
                    onChange={(e) => void switchSalesperson(e.target.value)}
                    title="Active salesperson"
                    className="h-8 max-w-[9rem] truncate rounded-full border border-line bg-mist px-2 text-[11px] outline-none focus:border-gold disabled:opacity-60"
                  >
                    {salespeople.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Badge tone={cart.length > 0 ? "success" : "neutral"}>
                  {cart.length > 0 ? "Live" : "Idle"}
                </Badge>
              </div>
            </div>

            {/* Line 1: name */}
            <label className="mt-3 block">
              <span className="text-[11px] font-medium text-ink-muted">
                Name
              </span>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
                className="mt-1 h-9 w-full rounded-full border border-line bg-mist px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              />
            </label>

            {/* Line 2: contact — equal label rows so inputs align */}
            <div className="mt-2 grid grid-cols-2 items-end gap-2">
              <label className="min-w-0 block">
                <span className="flex h-4 items-center gap-1 text-[11px] font-medium leading-none text-ink-muted">
                  Phone
                  {customerMatch ? (
                    <Badge tone="success" className="h-4 px-1.5 text-[9px]">
                      Known
                    </Badge>
                  ) : null}
                </span>
                <input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (digitsOnly(e.target.value).length < 7) {
                      setCustomerMatch(null);
                    }
                  }}
                  placeholder="+971 …"
                  inputMode="tel"
                  className="mt-1 box-border h-9 w-full rounded-full border border-line bg-mist px-3 text-sm leading-normal outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                />
              </label>
              <label className="min-w-0 block">
                <span className="flex h-4 items-center text-[11px] font-medium leading-none text-ink-muted">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@…"
                  className="mt-1 box-border h-9 w-full rounded-full border border-line bg-mist px-3 text-sm leading-normal outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                />
              </label>
            </div>
          </div>

          {/* Only cart / held scrolls */}
          <div className="scrollbar-thin mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-mist/40 px-3 py-8 text-center text-sm text-ink-muted">
                Cart is empty — add products or remix
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.key}
                  className="rounded-lg border border-line/70 bg-mist/30 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {line.product.name}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {line.unitLabel} · {line.lineType}
                        {line.oilProductName
                          ? ` · oil: ${line.oilProductName}`
                          : ""}
                      </p>
                      {line.bomNote ? (
                        <p className="mt-0.5 text-[10px] text-sage">
                          {line.bomNote}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="shrink-0 text-ink-muted hover:text-coral"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
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

          {/* Fixed footer — always on screen */}
          <div className="shrink-0 border-t border-line/70 pt-3">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 text-[11px] text-ink-muted">
                {vatPercent > 0 ? (
                  <>
                    <p>
                      Net {formatMoney(netAmount)} · VAT {vatPercent}%{" "}
                      {formatMoney(vatAmount)}
                    </p>
                    <p className="text-[10px]">Prices include VAT</p>
                  </>
                ) : (
                  <p>Subtotal</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] text-ink-muted">Total</p>
                <p className="font-semibold text-xl tabular-nums leading-none">
                  {formatMoney(subtotal)}
                </p>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-5 gap-1">
              {payments.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPayment(p.id)}
                  className={`flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-1 text-[9px] font-medium transition ${
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

            <Button
              className="mt-2 w-full"
              variant="secondary"
              size="sm"
              disabled={cart.length === 0 || holding || checkingOut}
              onClick={() => void holdBill()}
            >
              <Pause className="h-3.5 w-3.5" />
              Hold bill
            </Button>

            {cart.length > 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={receiptBusy !== null}
                  onClick={() => printCurrent("thermal")}
                >
                  <Printer className="h-3.5 w-3.5" />
                  {receiptBusy === "print-thermal" ? "…" : "80mm"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={receiptBusy !== null}
                  onClick={() => printCurrent("a4")}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {receiptBusy === "print-a4" ? "…" : "A4"}
                </Button>
              </div>
            ) : null}

            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted">
              <input
                type="checkbox"
                checked={printAfterComplete}
                onChange={(e) => {
                  const on = e.target.checked;
                  setPrintAfterComplete(on);
                  if (settings.data) {
                    void api<AppSettings>("/api/settings", {
                      method: "PUT",
                      body: JSON.stringify({
                        ...settings.data,
                        autoPrintReceipt: on,
                      }),
                    })
                      .then((updated) => settings.setData(updated))
                      .catch(() => undefined);
                  }
                }}
                className="h-3.5 w-3.5 accent-[var(--gold,#b8912f)]"
              />
              Print after complete
            </label>

            <Button
              className="mt-2 w-full"
              variant="gold"
              disabled={cart.length === 0 || checkingOut || holding}
              onClick={checkout}
            >
              {`Complete Sale · ${formatMoney(subtotal)}`}
            </Button>
            <p className="mt-1 text-center text-[10px] text-ink-muted">
              Shortcut · F9
            </p>

            {/* Held bills dropdown — below Complete */}
            {heldList.length > 0 ? (
              <div className="relative mt-2">
                <button
                  type="button"
                  onClick={() => setHeldMenuOpen((o) => !o)}
                  className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line bg-mist/50 px-3 text-left text-xs font-medium text-ink transition hover:border-line-strong"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone="warning">{heldList.length}</Badge>
                    <span className="truncate">
                      Held ·{" "}
                      {heldList[0].customerName &&
                      heldList[0].customerName !== "Walk-in Customer"
                        ? heldList[0].customerName
                        : heldList[0].customerPhone || "Bill"}
                      {heldList[0].salesperson
                        ? ` · ${heldList[0].salesperson}`
                        : ""}
                      {heldList.length > 1 ? ` (+${heldList.length - 1})` : ""}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-ink-muted transition ${
                      heldMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {heldMenuOpen ? (
                  <div className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-canvas p-2 shadow-lg">
                    {cart.length > 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-ink-muted">
                        Complete or clear the cart before resuming a held bill.
                      </p>
                    ) : null}
                    {heldList.map((sale) => {
                      const lineCount = sale.lines?.length ?? 0;
                      const busy =
                        resumingId === sale.id || discardingId === sale.id;
                      const title =
                        sale.customerName &&
                        sale.customerName !== "Walk-in Customer"
                          ? sale.customerName
                          : sale.customerPhone || "No phone";
                      return (
                        <div
                          key={sale.id}
                          className="rounded-lg border border-line/70 bg-mist/30 px-2.5 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">
                                {title}
                              </p>
                              <p className="truncate text-[11px] text-ink-muted">
                                Salesperson:{" "}
                                {sale.salesperson || "Not assigned"}
                              </p>
                              <p className="truncate text-[11px] text-ink-muted">
                                {sale.customerPhone || "—"} · {sale.time || "—"}{" "}
                                · {lineCount} line
                                {lineCount === 1 ? "" : "s"} ·{" "}
                                {formatMoney(sale.total)}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void discardHeld(sale)}
                              className="shrink-0 text-ink-muted hover:text-coral disabled:opacity-40"
                              title="Discard held bill"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <Button
                            className="mt-1.5 w-full"
                            size="sm"
                            variant="secondary"
                            disabled={cart.length > 0 || busy}
                            onClick={() => {
                              setHeldMenuOpen(false);
                              void resumeHeld(sale);
                            }}
                          >
                            <Play className="h-3.5 w-3.5" />
                            {resumingId === sale.id ? "Resuming…" : "Resume"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      {saleDoneOpen && lastSale ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          onClick={() => setSaleDoneOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSaleDoneOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-done-title"
            className="animate-fade-up w-full max-w-md rounded-2xl border border-line bg-canvas p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-deep">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  id="sale-done-title"
                  className="font-semibold text-lg text-ink"
                >
                  Sale complete
                </h3>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {formatMoney(lastSale.total)} · {lastSale.payment}
                  {lastSale.customerName
                    ? ` · ${lastSale.customerName}`
                    : lastSale.phone
                      ? ` · ${lastSale.phone}`
                      : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaleDoneOpen(false)}
                className="text-ink-muted hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Button
              className="mt-4 w-full"
              variant="gold"
              onClick={() => {
                setSaleDoneOpen(false);
                searchRef.current?.focus();
              }}
            >
              Next customer
            </Button>

            <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Receipt options (optional)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={receiptBusy !== null}
                onClick={() => void printSale(lastSale, "thermal", false)}
              >
                <Printer className="h-4 w-4" />
                {receiptBusy === "print-thermal" ? "Printing…" : "Print 80mm"}
              </Button>
              <Button
                variant="secondary"
                disabled={receiptBusy !== null}
                onClick={() => void printSale(lastSale, "a4", false)}
              >
                <FileText className="h-4 w-4" />
                {receiptBusy === "print-a4" ? "Printing…" : "A4 / PDF"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void sendReceipt(["whatsapp"])}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              <Button
                variant="secondary"
                onClick={() => void sendReceipt(["email"])}
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
              <Button
                variant="secondary"
                disabled={!smsAvailable}
                title={
                  smsAvailable
                    ? undefined
                    : "Set SMS_PROVIDER and Twilio keys to enable SMS"
                }
                onClick={() => void sendReceipt(["sms"])}
              >
                <Smartphone className="h-4 w-4" />
                SMS
              </Button>
              <Button
                variant="secondary"
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
            {!smsAvailable ? (
              <p className="mt-2 text-center text-[11px] text-ink-muted">
                SMS is off until Twilio keys are set.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

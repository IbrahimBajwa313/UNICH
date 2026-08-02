import mongoose from "mongoose";
import { resolveDeductMlFromUnitLabel } from "@/lib/format";
import { Formula, Product } from "@/lib/models";
import {
  OIL_BASE_PRODUCT_ID,
  REMIX_REQUIRED_ROLES,
  matchRemixRole,
  roleLabel,
  type RemixRequiredRole,
} from "@/lib/sales/constants";
import { SaleError } from "@/lib/sales/errors";

export type IncomingSaleLine = {
  productId?: string;
  name?: string;
  qty: number;
  unitLabel?: string;
  unitPrice?: number;
  lineType: string;
  bomNote?: string;
  deductMl?: number;
  oilProductId?: string;
  /** Ignored for remix — backend uses formula oil qty. */
  oilMl?: number;
  packagingProductIds?: string[];
};

export type DeductionNeed = {
  productId: string;
  productName: string;
  qty: number;
  reason: string;
  lineIndex: number;
};

export type ValidatedSaleLine = {
  productId?: string;
  name: string;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  lineType: "ready" | "remix" | "oil" | "refill" | "packaging" | "wholesale";
  bomNote?: string;
  deductMl?: number;
  oilProductId?: string;
  oilMl?: number;
  packagingProductIds?: string[];
};

export type SaleValidationResult = {
  lines: ValidatedSaleLine[];
  deductions: DeductionNeed[];
  subtotal: number;
};

type FormulaDoc = {
  components: Array<{
    productId: string;
    productName: string;
    qty: number;
    unit: string;
  }>;
  yieldMl: number;
  name: string;
};

type ProductLean = {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku?: string;
  unit: string;
  sellPrice: number;
  wholesalePrice?: number;
  stockSellable?: number;
};

function assertPositiveQty(qty: number, label: string) {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new SaleError("INVALID_LINE", `Invalid quantity for ${label}`);
  }
}

function resolvePriceFromProduct(
  product: ProductLean,
  lineType: string,
): { name: string; unitPrice: number; unit: string } {
  const unitPrice =
    lineType === "wholesale" && (product.wholesalePrice ?? 0) > 0
      ? product.wholesalePrice!
      : product.sellPrice;
  return { name: product.name, unitPrice, unit: product.unit };
}

/**
 * Validates remix formula presence + required packaging/raw roles.
 * Oil is a separate mandatory selection (oil-base placeholder).
 * Uses a preloaded product map to avoid N+1 Atlas round-trips.
 */
export async function validateRemixSale(
  formula: FormulaDoc | null,
  options: {
    oilProductId?: string;
    lineQty: number;
    lineIndex: number;
    productsById?: Map<string, ProductLean>;
  },
): Promise<{
  oilMl: number;
  oilProductId: string;
  oilProductName: string;
  componentDeductions: DeductionNeed[];
}> {
  if (!formula) {
    throw new SaleError("FORMULA_MISSING", "Formula missing");
  }

  const productsById = options.productsById ?? new Map<string, ProductLean>();
  const foundRoles = new Map<RemixRequiredRole, FormulaDoc["components"][number]>();
  let oilComponent: FormulaDoc["components"][number] | undefined;

  for (const comp of formula.components) {
    if (comp.productId === OIL_BASE_PRODUCT_ID) {
      oilComponent = comp;
      continue;
    }

    if (!mongoose.isValidObjectId(comp.productId)) {
      throw new SaleError(
        "FORMULA_INCOMPLETE",
        `Formula incomplete: invalid product for ${comp.productName}`,
      );
    }

    if (!Number.isFinite(comp.qty) || comp.qty <= 0) {
      throw new SaleError(
        "FORMULA_INCOMPLETE",
        `Formula incomplete: invalid qty for ${comp.productName}`,
      );
    }

    let product = productsById.get(comp.productId);
    if (!product) {
      const loaded = await Product.findById(comp.productId).lean<ProductLean>();
      if (!loaded) {
        throw new SaleError(
          "FORMULA_INCOMPLETE",
          `Formula incomplete: product not found for ${comp.productName}`,
        );
      }
      product = loaded;
      productsById.set(comp.productId, product);
    }

    const role = matchRemixRole(comp.productName, product.sku);
    if (role && !foundRoles.has(role)) {
      foundRoles.set(role, comp);
    }
  }

  const missing = REMIX_REQUIRED_ROLES.filter((role) => !foundRoles.has(role));
  if (missing.length > 0) {
    throw new SaleError(
      "FORMULA_INCOMPLETE",
      `Formula incomplete: ${missing.map(roleLabel).join(", ")} missing`,
    );
  }

  if (!oilComponent || oilComponent.qty <= 0) {
    throw new SaleError(
      "FORMULA_INCOMPLETE",
      "Formula incomplete: oil quantity (oil-base) missing",
    );
  }

  if (!options.oilProductId || !mongoose.isValidObjectId(options.oilProductId)) {
    throw new SaleError("OIL_NOT_SELECTED", "Oil not selected");
  }

  let oilProduct = productsById.get(options.oilProductId);
  if (!oilProduct) {
    const loaded = await Product.findById(options.oilProductId).lean<ProductLean>();
    if (!loaded) {
      throw new SaleError("OIL_NOT_SELECTED", "Oil not selected");
    }
    oilProduct = loaded;
    productsById.set(options.oilProductId, oilProduct);
  }
  if (oilProduct.unit !== "ml") {
    throw new SaleError(
      "OIL_NOT_SELECTED",
      "Oil not selected: selected product must be sold by ml",
    );
  }

  const lineQty = options.lineQty;
  const oilMl = oilComponent.qty; // backend-owned; never trust client oilMl
  const componentDeductions: DeductionNeed[] = [];

  for (const role of REMIX_REQUIRED_ROLES) {
    const comp = foundRoles.get(role)!;
    componentDeductions.push({
      productId: comp.productId,
      productName: comp.productName,
      qty: comp.qty * lineQty,
      reason: `remix:${role}`,
      lineIndex: options.lineIndex,
    });
  }

  // Also deduct any other valid BOM components (e.g. pouch) that are not required roles
  for (const comp of formula.components) {
    if (comp.productId === OIL_BASE_PRODUCT_ID) continue;
    if (!mongoose.isValidObjectId(comp.productId)) continue;
    const already = componentDeductions.some((d) => d.productId === comp.productId);
    if (already) continue;
    componentDeductions.push({
      productId: comp.productId,
      productName: comp.productName,
      qty: comp.qty * lineQty,
      reason: `remix:extra:${comp.productName}`,
      lineIndex: options.lineIndex,
    });
  }

  return {
    oilMl,
    oilProductId: String(oilProduct._id),
    oilProductName: oilProduct.name,
    componentDeductions: [
      ...componentDeductions,
      {
        productId: String(oilProduct._id),
        productName: oilProduct.name,
        qty: oilMl * lineQty,
        reason: "remix:oil",
        lineIndex: options.lineIndex,
      },
    ],
  };
}

function requireProduct(
  productsById: Map<string, ProductLean>,
  productId: string,
  label = productId,
): ProductLean {
  const product = productsById.get(productId);
  if (!product) {
    throw new SaleError("PRODUCT_NOT_FOUND", `Product not found: ${label}`);
  }
  return product;
}

/**
 * Full pre-sale validation: business rules + deduction plan (no writes).
 * Batches product + formula reads to minimise Atlas round-trips.
 */
export async function validateSaleLines(
  rawLines: IncomingSaleLine[],
): Promise<SaleValidationResult> {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new SaleError("VALIDATION", "At least one line item is required");
  }

  const needsRemix = rawLines.some((l) => l.lineType === "remix");
  const productIds = new Set<string>();

  for (const raw of rawLines) {
    if (raw.productId && mongoose.isValidObjectId(raw.productId)) {
      productIds.add(raw.productId);
    }
    if (raw.oilProductId && mongoose.isValidObjectId(raw.oilProductId)) {
      productIds.add(raw.oilProductId);
    }
    if (Array.isArray(raw.packagingProductIds)) {
      for (const id of raw.packagingProductIds) {
        if (mongoose.isValidObjectId(id)) productIds.add(id);
      }
    }
  }

  const [remixFormula, products] = await Promise.all([
    needsRemix
      ? Formula.findOne({ type: "remix" }).lean<FormulaDoc>()
      : Promise.resolve(null),
    productIds.size > 0
      ? Product.find({ _id: { $in: [...productIds] } })
          .select("name sku unit sellPrice wholesalePrice stockSellable")
          .lean<ProductLean[]>()
      : Promise.resolve([] as ProductLean[]),
  ]);

  const productsById = new Map<string, ProductLean>(
    products.map((p) => [String(p._id), p]),
  );

  // Prefetch remix BOM component products in one query
  if (remixFormula) {
    const missing = remixFormula.components
      .map((c) => c.productId)
      .filter(
        (id) =>
          id !== OIL_BASE_PRODUCT_ID &&
          mongoose.isValidObjectId(id) &&
          !productsById.has(id),
      );
    if (missing.length > 0) {
      const extra = await Product.find({ _id: { $in: missing } })
        .select("name sku unit sellPrice wholesalePrice stockSellable")
        .lean<ProductLean[]>();
      for (const p of extra) productsById.set(String(p._id), p);
    }
  }

  const lines: ValidatedSaleLine[] = [];
  const deductions: DeductionNeed[] = [];
  let subtotal = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const qty = Number(raw.qty);
    assertPositiveQty(qty, `line ${i + 1}`);

    const lineType = raw.lineType as ValidatedSaleLine["lineType"];
    const allowed = [
      "ready",
      "remix",
      "oil",
      "refill",
      "packaging",
      "wholesale",
    ] as const;
    if (!allowed.includes(lineType as (typeof allowed)[number])) {
      throw new SaleError("INVALID_LINE", `Invalid line type: ${raw.lineType}`);
    }

    if (lineType === "ready" || lineType === "wholesale") {
      if (!raw.productId || !mongoose.isValidObjectId(raw.productId)) {
        throw new SaleError("INVALID_LINE", `Product required for ${lineType} line`);
      }
      const product = requireProduct(productsById, raw.productId);
      const resolved = resolvePriceFromProduct(product, lineType);
      lines.push({
        productId: raw.productId,
        name: resolved.name,
        qty,
        unitLabel: raw.unitLabel || resolved.unit,
        unitPrice: resolved.unitPrice,
        lineType,
        bomNote: raw.bomNote,
      });
      deductions.push({
        productId: raw.productId,
        productName: resolved.name,
        qty,
        reason: lineType,
        lineIndex: i,
      });
      subtotal += qty * resolved.unitPrice;
      continue;
    }

    if (lineType === "oil") {
      if (!raw.productId || !mongoose.isValidObjectId(raw.productId)) {
        throw new SaleError("INVALID_LINE", "Product required for oil line");
      }
      const product = requireProduct(productsById, raw.productId);
      if (product.unit !== "ml") {
        throw new SaleError("INVALID_LINE", "Oil line product must use ml unit");
      }
      const deductMl = resolveDeductMlFromUnitLabel(raw.unitLabel);
      if (deductMl == null) {
        throw new SaleError(
          "INVALID_LINE",
          "Oil quantity (ml) is required — use 1 Tola / ½ Tola / ¼ Tola or N ml",
        );
      }
      const unitPrice = Number((product.sellPrice * deductMl).toFixed(3));
      const unitLabel = raw.unitLabel?.trim() || `${deductMl} ml`;
      lines.push({
        productId: raw.productId,
        name: product.name,
        qty,
        unitLabel,
        unitPrice,
        lineType: "oil",
        deductMl,
        bomNote: raw.bomNote || `Deduct ${deductMl} ml from ${product.name}`,
      });
      deductions.push({
        productId: raw.productId,
        productName: product.name,
        qty: deductMl * qty,
        reason: "oil",
        lineIndex: i,
      });
      subtotal += qty * unitPrice;
      continue;
    }

    if (lineType === "refill") {
      if (!raw.productId || !mongoose.isValidObjectId(raw.productId)) {
        throw new SaleError("INVALID_LINE", "Oil product required for refill line");
      }
      const product = requireProduct(productsById, raw.productId);
      if (product.unit !== "ml") {
        throw new SaleError("INVALID_LINE", "Refill oil product must use ml unit");
      }
      const deductMl = resolveDeductMlFromUnitLabel(raw.unitLabel);
      if (deductMl == null) {
        throw new SaleError(
          "INVALID_LINE",
          "Refill quantity (ml) is required — use a label like 100ml refill",
        );
      }
      // Backend-owned refill service rate (AED per ml) — do not trust client unitPrice
      const REFILL_AED_PER_ML = 1.2;
      const unitPrice = Number((REFILL_AED_PER_ML * deductMl).toFixed(3));
      const unitLabel = raw.unitLabel?.trim() || `${deductMl}ml refill`;

      lines.push({
        productId: raw.productId,
        name: raw.name || `${product.name} refill`,
        qty,
        unitLabel,
        unitPrice,
        lineType: "refill",
        deductMl,
        bomNote: raw.bomNote,
        packagingProductIds: raw.packagingProductIds,
      });
      deductions.push({
        productId: raw.productId,
        productName: product.name,
        qty: deductMl * qty,
        reason: "refill:oil",
        lineIndex: i,
      });

      const packagingIds = Array.isArray(raw.packagingProductIds)
        ? raw.packagingProductIds
        : [];
      for (const pkgId of packagingIds) {
        if (!mongoose.isValidObjectId(pkgId)) {
          throw new SaleError("INVALID_LINE", "Invalid packaging product on refill");
        }
        const pkg = requireProduct(productsById, pkgId, "packaging");
        deductions.push({
          productId: String(pkg._id),
          productName: pkg.name,
          qty: qty,
          reason: "refill:packaging",
          lineIndex: i,
        });
        subtotal += qty * pkg.sellPrice;
      }

      subtotal += qty * unitPrice;
      continue;
    }

    if (lineType === "packaging") {
      if (!raw.productId || !mongoose.isValidObjectId(raw.productId)) {
        throw new SaleError("INVALID_LINE", "Product required for packaging line");
      }
      const product = requireProduct(productsById, raw.productId);
      const resolved = resolvePriceFromProduct(product, "packaging");
      lines.push({
        productId: raw.productId,
        name: resolved.name,
        qty,
        unitLabel: raw.unitLabel || resolved.unit,
        unitPrice: resolved.unitPrice,
        lineType: "packaging",
        bomNote: raw.bomNote,
      });
      deductions.push({
        productId: raw.productId,
        productName: resolved.name,
        qty,
        reason: "packaging",
        lineIndex: i,
      });
      subtotal += qty * resolved.unitPrice;
      continue;
    }

    if (lineType === "remix") {
      const remix = await validateRemixSale(remixFormula as FormulaDoc | null, {
        oilProductId: raw.oilProductId,
        lineQty: qty,
        lineIndex: i,
        productsById,
      });

      let unitPrice = 0;
      let name = raw.name || "Remix";
      let productId = raw.productId;
      if (!raw.productId || !mongoose.isValidObjectId(raw.productId)) {
        throw new SaleError("INVALID_LINE", "Remix product required");
      }
      const product = requireProduct(productsById, raw.productId);
      const resolved = resolvePriceFromProduct(product, "remix");
      unitPrice = resolved.unitPrice;
      name = resolved.name;
      productId = raw.productId;

      lines.push({
        productId,
        name,
        qty,
        unitLabel: raw.unitLabel || "pcs",
        unitPrice,
        lineType: "remix",
        bomNote:
          raw.bomNote ||
          `BOM: ${remix.oilMl}ml ${remix.oilProductName} + formula components`,
        oilProductId: remix.oilProductId,
        oilMl: remix.oilMl,
      });
      deductions.push(...remix.componentDeductions);
      subtotal += qty * unitPrice;
      continue;
    }
  }

  return { lines, deductions, subtotal };
}

/**
 * Verify every planned deduction has enough sellable + FIFO stock (read-only).
 * Not used on the hot POS path — deductFifo enforces atomically (saves ~1 RTT).
 * Available for admin tools / preflight checks.
 */
export async function assertStockAvailable(deductions: DeductionNeed[]) {
  const totals = new Map<string, { qty: number; name: string }>();
  for (const d of deductions) {
    const cur = totals.get(d.productId) || { qty: 0, name: d.productName };
    cur.qty += d.qty;
    cur.name = d.productName;
    totals.set(d.productId, cur);
  }

  if (totals.size === 0) return;

  const { FifoLayer } = await import("@/lib/models");
  const ids = [...totals.keys()];

  const [products, fifoRows] = await Promise.all([
    Product.find({ _id: { $in: ids } })
      .select("name stockSellable")
      .lean<
        Array<{
          _id: mongoose.Types.ObjectId;
          name: string;
          stockSellable: number;
        }>
      >(),
    FifoLayer.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
      {
        $match: {
          productId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
          qtyRemaining: { $gt: 0 },
        },
      },
      { $group: { _id: "$productId", total: { $sum: "$qtyRemaining" } } },
    ]),
  ]);

  const productById = new Map(products.map((p) => [String(p._id), p]));
  const fifoById = new Map(fifoRows.map((r) => [String(r._id), r.total]));

  for (const [productId, { qty, name }] of totals) {
    const product = productById.get(productId);
    if (!product) {
      throw new SaleError("PRODUCT_NOT_FOUND", `Product not found: ${name}`);
    }
    if (product.stockSellable < qty) {
      throw new SaleError(
        "INSUFFICIENT_STOCK",
        `Insufficient stock for ${product.name} (need ${qty}, have ${product.stockSellable})`,
      );
    }

    const fifoTotal = fifoById.get(productId) ?? 0;
    if (fifoTotal < qty) {
      throw new SaleError(
        "INSUFFICIENT_STOCK",
        `Insufficient stock for ${product.name} (FIFO need ${qty}, have ${fifoTotal})`,
      );
    }
  }
}

const FAST_LINE_TYPES = new Set(["ready", "packaging", "wholesale"]);

/**
 * @deprecated Always use validateSaleLines — client prices must not be trusted.
 * Kept only so existing imports compile; always returns null.
 */
export function tryFastValidateSaleLines(
  _rawLines: IncomingSaleLine[],
): SaleValidationResult | null {
  void FAST_LINE_TYPES;
  return null;
}


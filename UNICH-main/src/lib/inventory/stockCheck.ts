import mongoose from "mongoose";
import { Product, FifoLayer } from "@/lib/models";

export type StockNeed = {
  productId: string;
  qty: number;
  productName?: string;
};

export type StockShortage = {
  productId: string;
  productName: string;
  need: number;
  available: number;
  fifoAvailable: number;
  /** True when product is missing from catalogue. */
  missing?: boolean;
  /** True when sellable or FIFO cannot cover the need. */
  short: boolean;
  /** INV-06 warning copy for UI / API responses. */
  warning: string;
};

export type StockCheckResult = {
  ok: boolean;
  shortages: StockShortage[];
  /** Flattened warnings for every short line (INV-06). */
  warnings: string[];
};

/**
 * INV-06: shared read-only stock check for any outflow path
 * (sale preflight, production preview, adjustments, transfers).
 * Does not mutate stock — callers decide warn vs block.
 */
export async function checkStockAvailability(
  needs: StockNeed[],
): Promise<StockCheckResult> {
  const totals = new Map<string, { qty: number; name: string }>();
  for (const n of needs) {
    if (!(n.qty > 0) || !n.productId) continue;
    const cur = totals.get(n.productId) || {
      qty: 0,
      name: n.productName || n.productId,
    };
    cur.qty += n.qty;
    if (n.productName) cur.name = n.productName;
    totals.set(n.productId, cur);
  }

  if (totals.size === 0) {
    return { ok: true, shortages: [], warnings: [] };
  }

  const ids = [...totals.keys()];
  const objectIds = ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const [products, fifoRows] = await Promise.all([
    Product.find({ _id: { $in: objectIds } })
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
          productId: { $in: objectIds },
          qtyRemaining: { $gt: 0 },
        },
      },
      { $group: { _id: "$productId", total: { $sum: "$qtyRemaining" } } },
    ]),
  ]);

  const productById = new Map(products.map((p) => [String(p._id), p]));
  const fifoById = new Map(fifoRows.map((r) => [String(r._id), r.total]));

  const shortages: StockShortage[] = [];
  const warnings: string[] = [];

  for (const [productId, { qty, name }] of totals) {
    const product = productById.get(productId);
    if (!product) {
      const warning = `Stock warning: product not found (${name}). Admin should restock or reorder after correcting the catalogue.`;
      shortages.push({
        productId,
        productName: name,
        need: qty,
        available: 0,
        fifoAvailable: 0,
        missing: true,
        short: true,
        warning,
      });
      warnings.push(warning);
      continue;
    }

    const available = product.stockSellable ?? 0;
    const fifoAvailable = fifoById.get(productId) ?? 0;
    const productName = product.name || name;
    const short = available < qty || fifoAvailable < qty;
    const warning = short
      ? `Stock warning: ${productName} needs ${qty}, sellable ${available}, FIFO ${fifoAvailable}. Admin should restock or reorder.`
      : `OK: ${productName} needs ${qty}, available ${available}`;

    shortages.push({
      productId,
      productName,
      need: qty,
      available,
      fifoAvailable,
      short,
      warning,
    });
    if (short) warnings.push(warning);
  }

  return {
    ok: warnings.length === 0,
    shortages,
    warnings,
  };
}

/**
 * INV-06 helper when an admin edits sellable stock directly.
 * Negative (or below zero after change) must warn all users; admin may still save.
 */
export function warnIfNegativeStock(
  productName: string,
  nextSellable: number,
): string | null {
  if (nextSellable < 0) {
    return `Stock warning: ${productName} sellable would be ${nextSellable}. Negative stock is permitted with warning — admin should restock or reorder.`;
  }
  return null;
}

/** ALT-01 default low-stock thresholds by product shape. */
export function defaultLowStockAt(input: {
  unit: string;
  category?: string;
  itemType?: string;
  name?: string;
}): number {
  const unit = input.unit;
  const name = (input.name || "").toLowerCase();
  const category = (input.category || "").toLowerCase();
  const itemType = input.itemType || "";

  // Individual notes (raw aroma chemicals / notes) — 5 ml
  if (
    unit === "ml" &&
    (itemType === "raw" ||
      /\bnote\b/i.test(name) ||
      category.includes("note") ||
      category.includes("raw"))
  ) {
    return 5;
  }

  // Oils — 100 ml
  if (unit === "ml") return 100;

  // Commercial / finished pcs — 5 pieces
  if (unit === "pcs") return 5;

  return 0;
}

import mongoose from "mongoose";
import { Formula, Product } from "@/lib/models";
import { OIL_BASE_PRODUCT_ID } from "@/lib/sales/constants";
import { SaleError } from "@/lib/sales/errors";
import { validateRemixSale } from "@/lib/sales/validateSale";

export type ProductionPlanLine = {
  productId: string;
  productName: string;
  qty: number;
  unit: string;
  reason: string;
};

export type ProductionPlan = {
  formulaId: string;
  formulaName: string;
  formulaType: "remix" | "oil" | "bakhoor";
  formulaVersion: number;
  qty: number;
  yieldMl: number;
  needsOilSelection: boolean;
  oilProductId?: string;
  oilProductName?: string;
  plannedLines: ProductionPlanLine[];
  defaultOutputQty: (outputUnit: string) => number;
};

type FormulaLean = {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: "remix" | "oil" | "bakhoor";
  status: string;
  version?: number;
  yieldMl: number;
  components: Array<{
    productId: string;
    productName: string;
    qty: number;
    unit: string;
  }>;
};

type ProductLean = {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku?: string;
  unit: string;
  stockSellable?: number;
};

/**
 * Build a material consumption plan for a production order.
 * Remix + oil-base uses the same BOM rules as POS remix sales.
 * Oil/bakhoor (and customer blends without oil-base) consume recipe lines directly.
 */
export async function planProduction(input: {
  formulaId: string;
  qty: number;
  oilProductId?: string;
}): Promise<ProductionPlan> {
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
    throw new SaleError("VALIDATION", "Production qty must be a whole number ≥ 1");
  }
  if (!mongoose.isValidObjectId(input.formulaId)) {
    throw new SaleError("FORMULA_MISSING", "Invalid formula id");
  }

  const formula = await Formula.findById(input.formulaId).lean<FormulaLean>();
  if (!formula) {
    throw new SaleError("FORMULA_MISSING", "Formula not found");
  }
  if (formula.status !== "approved") {
    throw new SaleError(
      "FORMULA_MISSING",
      "Only approved formulas can be used for production",
    );
  }

  const hasOilBase = formula.components.some(
    (c) => String(c.productId) === OIL_BASE_PRODUCT_ID,
  );

  const productIds = new Set<string>();
  for (const c of formula.components) {
    if (String(c.productId) === OIL_BASE_PRODUCT_ID) continue;
    if (mongoose.isValidObjectId(c.productId)) productIds.add(String(c.productId));
  }
  if (input.oilProductId && mongoose.isValidObjectId(input.oilProductId)) {
    productIds.add(String(input.oilProductId));
  }

  // Customer blends may fill missing packaging from the default remix BOM (same as POS).
  let packagingFallback: FormulaLean | null = null;
  if (!hasOilBase && formula.type === "remix") {
    packagingFallback = await Formula.findOne({
      type: "remix",
      status: "approved",
      $or: [{ customerId: null }, { customerId: { $exists: false } }],
    })
      .sort({ updatedAt: -1 })
      .lean<FormulaLean>();
    if (packagingFallback) {
      for (const c of packagingFallback.components) {
        if (String(c.productId) === OIL_BASE_PRODUCT_ID) continue;
        if (mongoose.isValidObjectId(c.productId)) {
          productIds.add(String(c.productId));
        }
      }
    }
  }

  const products = productIds.size
    ? await Product.find({ _id: { $in: [...productIds] } }).lean<
        Array<ProductLean & { sellPrice?: number }>
      >()
    : [];
  const productsById = new Map(
    products.map(
      (p) =>
        [
          String(p._id),
          {
            _id: p._id,
            name: p.name,
            sku: p.sku,
            unit: p.unit,
            sellPrice: p.sellPrice ?? 0,
            stockSellable: p.stockSellable,
          },
        ] as const,
    ),
  );

  let plannedLines: ProductionPlanLine[] = [];
  let oilProductId: string | undefined;
  let oilProductName: string | undefined;

  if (hasOilBase || formula.type === "remix") {
    const remix = await validateRemixSale(formula, {
      oilProductId: input.oilProductId,
      lineQty: qty,
      lineIndex: 0,
      productsById: productsById as never,
      packagingFallback: packagingFallback || undefined,
    });
    oilProductId = remix.oilProductId;
    oilProductName = remix.oilProductName;

    plannedLines = remix.componentDeductions.map((d) => {
      const p = productsById.get(d.productId);
      return {
        productId: d.productId,
        productName: d.productName,
        qty: d.qty,
        unit: p?.unit || "ml",
        reason: d.reason.startsWith("remix:")
          ? d.reason.replace(/^remix:/, "production:")
          : `production:${d.reason}`,
      };
    });
  } else {
    // Oil / bakhoor / concrete recipes — deduct every component line.
    for (const comp of formula.components) {
      if (String(comp.productId) === OIL_BASE_PRODUCT_ID) continue;
      if (!mongoose.isValidObjectId(comp.productId)) {
        throw new SaleError(
          "FORMULA_INCOMPLETE",
          `Formula incomplete: invalid product for ${comp.productName}`,
        );
      }
      if (!(Number(comp.qty) > 0)) {
        throw new SaleError(
          "FORMULA_INCOMPLETE",
          `Formula incomplete: invalid qty for ${comp.productName}`,
        );
      }
      const product = productsById.get(String(comp.productId));
      if (!product) {
        throw new SaleError(
          "FORMULA_INCOMPLETE",
          `Formula incomplete: product not found for ${comp.productName}`,
        );
      }
      plannedLines.push({
        productId: String(comp.productId),
        productName: comp.productName || product.name,
        qty: Number(comp.qty) * qty,
        unit: comp.unit || product.unit,
        reason: `production:${comp.productName || product.name}`,
      });
    }
  }

  if (plannedLines.length === 0) {
    throw new SaleError("FORMULA_INCOMPLETE", "Formula has no consumable components");
  }

  // Coalesce duplicate product ids
  const coalesced = new Map<string, ProductionPlanLine>();
  for (const line of plannedLines) {
    const cur = coalesced.get(line.productId);
    if (cur) {
      cur.qty += line.qty;
    } else {
      coalesced.set(line.productId, { ...line });
    }
  }

  const yieldMl = Number(formula.yieldMl) || 0;

  return {
    formulaId: String(formula._id),
    formulaName: formula.name,
    formulaType: formula.type,
    formulaVersion: typeof formula.version === "number" ? formula.version : 1,
    qty,
    yieldMl,
    needsOilSelection: hasOilBase,
    oilProductId,
    oilProductName,
    plannedLines: [...coalesced.values()],
    defaultOutputQty: (outputUnit: string) => {
      if (outputUnit === "ml" || outputUnit === "g") {
        return Math.max(1, Math.round(yieldMl * qty));
      }
      return qty;
    },
  };
}

export function formulaNeedsOilSelection(components: Array<{ productId: string }>) {
  return components.some((c) => String(c.productId) === OIL_BASE_PRODUCT_ID);
}

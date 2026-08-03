import {
  OIL_BASE_PRODUCT_ID,
  REMIX_OIL_ML,
} from "@/lib/sales/constants";
import type { FormulaComponent, StockUnit } from "@/lib/types";

const UNITS: StockUnit[] = ["ml", "pcs", "g", "kg"];

/** Liquid contribution toward yieldMl (pcs ignored; g≈ml, kg→1000). */
export function liquidMlOf(component: Pick<FormulaComponent, "qty" | "unit">): number {
  const qty = Number(component.qty);
  if (!Number.isFinite(qty)) return 0;
  if (component.unit === "ml" || component.unit === "g") return qty;
  if (component.unit === "kg") return qty * 1000;
  return 0;
}

export function sumLiquidMl(
  components: Pick<FormulaComponent, "qty" | "unit">[],
): number {
  return components.reduce((sum, c) => sum + liquidMlOf(c), 0);
}

export type FormulaValidationInput = {
  name?: string;
  type?: string;
  yieldMl?: number;
  components?: FormulaComponent[];
};

/** Returns human-readable errors; empty = valid. */
export function validateFormulaInput(input: FormulaValidationInput): string[] {
  const errors: string[] = [];
  const name = input.name?.trim() ?? "";
  if (!name) errors.push("Name is required");

  if (!input.type || !["remix", "oil", "bakhoor"].includes(input.type)) {
    errors.push("Type must be remix, oil, or bakhoor");
  }

  const yieldMl = Number(input.yieldMl);
  if (!Number.isFinite(yieldMl) || yieldMl <= 0) {
    errors.push("Yield must be greater than 0 ml");
  }

  const components = input.components ?? [];
  if (components.length === 0) {
    errors.push("Add at least one ingredient");
    return errors;
  }

  components.forEach((c, i) => {
    const n = i + 1;
    if (!c.productId?.trim()) errors.push(`Ingredient #${n}: product is required`);
    if (!c.productName?.trim()) errors.push(`Ingredient #${n}: name is required`);
    const qty = Number(c.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push(`Ingredient #${n}: quantity must be greater than 0`);
    }
    if (!UNITS.includes(c.unit as StockUnit)) {
      errors.push(`Ingredient #${n}: unit must be ml, g, kg, or pcs`);
    }
  });

  if (errors.length) return errors;

  if (input.type === "remix") {
    const oilBase = components.find((c) => c.productId === OIL_BASE_PRODUCT_ID);
    const oilQty = Number(oilBase?.qty);
    if (!oilBase || !Number.isFinite(oilQty) || oilQty <= 0) {
      errors.push("Remix requires oil-base (Selected Oil Blend) quantity");
    } else if (oilQty !== REMIX_OIL_ML) {
      errors.push(
        `Remix oil-base must be ${REMIX_OIL_ML} ml (BLD-02/03) — got ${oilQty} ml`,
      );
    }
  }

  const liquid = sumLiquidMl(components);
  if (Math.abs(liquid - yieldMl) > 0.001) {
    errors.push(
      `Liquid total is ${liquid} ml but yield is ${yieldMl} ml — they must match (pcs ignored; g counts as ml, kg × 1000)`,
    );
  }

  return errors;
}

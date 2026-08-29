import { OIL_BASE_PRODUCT_ID } from "@/lib/sales/constants";
import type { FormulaComponent, StockUnit } from "@/lib/types";

export type MaterialsReservationLine = {
  productId: string;
  productName: string;
  qty: number;
  unit: StockUnit | string;
};

export type MaterialsReservation = {
  /** BLD-12: true only while formula status is approved. */
  active: boolean;
  reservedAt?: Date | string;
  lines: MaterialsReservationLine[];
};

/** Build reservation lines from recipe components (skip oil-base placeholder). */
export function buildMaterialsReservation(
  components: FormulaComponent[] | undefined,
  approved: boolean,
): MaterialsReservation {
  if (!approved) {
    return { active: false, lines: [] };
  }

  const lines: MaterialsReservationLine[] = [];
  for (const c of components || []) {
    if (!c?.productId || String(c.productId) === OIL_BASE_PRODUCT_ID) continue;
    if (!(Number(c.qty) > 0)) continue;
    lines.push({
      productId: String(c.productId),
      productName: c.productName || "Component",
      qty: Number(c.qty),
      unit: c.unit || "ml",
    });
  }

  return {
    active: true,
    reservedAt: new Date(),
    lines,
  };
}

export function clearMaterialsReservation(): MaterialsReservation {
  return { active: false, lines: [] };
}

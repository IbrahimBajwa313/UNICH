export type QuotationLineBody = {
  productId?: string;
  name?: string;
  qty?: number;
  unitLabel?: string;
  unitPrice?: number;
  lineType?: string;
  formulaId?: string;
  formulaName?: string;
  packagingProductIds?: string[];
  bottleNote?: string;
  designNote?: string;
  charges?: number;
  notes?: string;
};

const LINE_TYPES = new Set([
  "ready",
  "remix",
  "oil",
  "refill",
  "packaging",
  "wholesale",
  "custom_blend",
]);

/** Server-side normalization — never trust client-provided line shapes as-is. */
export function normalizeQuotationLines(raw: QuotationLineBody[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({
      productId: l.productId || undefined,
      name: String(l.name || "").trim() || "Item",
      qty: Number(l.qty ?? 0),
      unitLabel: String(l.unitLabel || "").trim() || "pcs",
      unitPrice: Number(l.unitPrice ?? 0),
      lineType: LINE_TYPES.has(String(l.lineType)) ? String(l.lineType) : "ready",
      formulaId: l.formulaId || undefined,
      formulaName: String(l.formulaName || ""),
      packagingProductIds: Array.isArray(l.packagingProductIds) ? l.packagingProductIds : [],
      bottleNote: String(l.bottleNote || ""),
      designNote: String(l.designNote || ""),
      charges: Math.max(0, Number(l.charges ?? 0)),
      notes: String(l.notes || ""),
    }))
    .filter((l) => l.qty > 0);
}

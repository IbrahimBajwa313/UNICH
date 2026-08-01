import type { ItemType, ProductCategory, StockUnit } from "@/lib/types";
import {
  CONCENTRATIONS,
  OIL_CATEGORIES,
  PCS_PREFERRED_CATEGORIES,
  PRODUCT_CATEGORIES,
  STOCK_UNITS,
  categoryCode,
  itemTypeFromLabel,
  type ExcelProductRow,
} from "@/lib/excel/columns";

export interface ExistingProductRef {
  id: string;
  sku: string;
  name: string;
  category: string;
  minMarginPct: number;
  costFifo: number;
  sellPrice: number;
  wholesalePrice?: number;
  brand?: string;
  concentration?: string;
  gender?: string;
  size?: string;
  collection?: string;
  notes?: string;
  itemType?: string;
  unit: string;
}

export interface ValidatedImportRow {
  rowNumber: number;
  action: "create" | "update" | "error";
  sku: string;
  errorReason?: string;
  priceFloorViolation?: boolean;
  payload?: {
    sku: string;
    name: string;
    category: ProductCategory;
    unit: StockUnit;
    brand: string;
    concentration: string;
    costFifo: number;
    sellPrice: number;
    wholesalePrice: number;
    gender: string;
    size: string;
    collection: string;
    notes: string;
    itemType: ItemType;
    minMarginPct: number;
  };
  previousProductSnapshot?: ExistingProductRef;
}

function parseSizeNumber(size: string): number | null {
  if (!size.trim()) return null;
  const m = size.trim().match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]);
}

function priceFloorOk(retail: number, cost: number, minMarginPct: number): boolean {
  const floor = cost * (1 + minMarginPct / 100);
  return retail + 1e-9 >= floor;
}

export function validateImportRows(
  rows: ExcelProductRow[],
  existing: ExistingProductRef[],
  opts?: { defaultMinMarginPct?: number; allowPriceFloorOverride?: boolean },
): ValidatedImportRow[] {
  const defaultMargin = opts?.defaultMinMarginPct ?? 0;
  const allowFloor = opts?.allowPriceFloorOverride ?? false;
  const bySku = new Map(existing.map((p) => [p.sku.toLowerCase(), p]));
  const nameCatKeys = new Map<string, string>(); // key -> sku
  for (const p of existing) {
    nameCatKeys.set(`${p.name.toLowerCase()}||${p.category.toLowerCase()}`, p.sku);
  }

  const fileNameCat = new Map<string, number>();
  const fileSkus = new Map<string, number>();
  const results: ValidatedImportRow[] = [];
  let createSeq = existing.length + 1;

  for (const row of rows) {
    const errors: string[] = [];

    if (!row.name) errors.push("Product Name is required");
    if (!row.category) errors.push("Category is required");
    if (!row.unit) errors.push("Unit is required");
    if (row.costPrice == null) errors.push("Cost Price is required");
    if (row.retailPrice == null) errors.push("Retail Price is required");
    if (!row.itemType) errors.push("Item Type is required");

    const category = row.category as ProductCategory;
    if (row.category && !PRODUCT_CATEGORIES.includes(category)) {
      errors.push(`Invalid Category: ${row.category}`);
    }

    const unit = row.unit as StockUnit;
    if (row.unit && !STOCK_UNITS.includes(unit)) {
      errors.push(`Invalid Unit: ${row.unit} (use ml or pcs)`);
    }

    if (
      row.concentration &&
      !CONCENTRATIONS.includes(row.concentration as (typeof CONCENTRATIONS)[number])
    ) {
      errors.push(`Invalid Concentration: ${row.concentration}`);
    }

    const itemType = itemTypeFromLabel(row.itemType);
    if (row.itemType && !itemType) {
      errors.push(
        `Invalid Item Type: ${row.itemType} (Finished Product / Packaging Component / Raw Material)`,
      );
    }

    if (row.costPrice != null && row.costPrice < 0) errors.push("Cost Price cannot be negative");
    if (row.retailPrice != null && row.retailPrice < 0) errors.push("Retail Price cannot be negative");
    if (row.wholesalePrice != null && row.wholesalePrice < 0) {
      errors.push("Wholesale Price cannot be negative");
    }
    if (row.costPrice === 0 && row.retailPrice === 0) {
      errors.push("Cost and Retail cannot both be zero");
    }

    if (PRODUCT_CATEGORIES.includes(category) && STOCK_UNITS.includes(unit)) {
      if (OIL_CATEGORIES.has(category) && unit !== "ml") {
        errors.push(`Category ${category} requires Unit ml`);
      }
      if (PCS_PREFERRED_CATEGORIES.has(category) && unit !== "pcs") {
        errors.push(`Category ${category} requires Unit pcs`);
      }
      if (OIL_CATEGORIES.has(category) && row.size) {
        const sizeNum = parseSizeNumber(row.size);
        if (sizeNum != null && sizeNum % 5 !== 0) {
          errors.push("Oil Size must be a multiple of 5 ml");
        }
      }
    }

    const nameCatKey = `${row.name.toLowerCase()}||${row.category.toLowerCase()}`;
    if (row.name && row.category) {
      if (fileNameCat.has(nameCatKey)) {
        errors.push(
          `Duplicate Product Name + Category in file (also row ${fileNameCat.get(nameCatKey)})`,
        );
      } else {
        fileNameCat.set(nameCatKey, row.rowNumber);
      }
    }

    let existingProduct: ExistingProductRef | undefined;
    let sku = row.internalCode.trim();
    let action: "create" | "update" = "create";

    if (sku) {
      if (fileSkus.has(sku.toLowerCase())) {
        errors.push(
          `Duplicate Internal Code in file (also row ${fileSkus.get(sku.toLowerCase())})`,
        );
      } else {
        fileSkus.set(sku.toLowerCase(), row.rowNumber);
      }
      existingProduct = bySku.get(sku.toLowerCase());
      if (!existingProduct) {
        errors.push(`Internal Code ${sku} not found — leave blank to create new`);
      } else {
        action = "update";
        const otherSku = nameCatKeys.get(nameCatKey);
        if (otherSku && otherSku.toLowerCase() !== sku.toLowerCase()) {
          errors.push("Product Name + Category already used by another Internal Code");
        }
      }
    } else {
      const clash = nameCatKeys.get(nameCatKey);
      if (clash) {
        errors.push(
          `Product Name + Category already exists (Internal Code ${clash}) — set Internal Code to update`,
        );
      }
      sku = `UN-${categoryCode(row.category || "XX")}-${String(createSeq).padStart(4, "0")}`;
      createSeq += 1;
      action = "create";
    }

    const minMarginPct = existingProduct?.minMarginPct ?? defaultMargin;
    let priceFloorViolation = false;
    if (
      row.costPrice != null &&
      row.retailPrice != null &&
      row.costPrice >= 0 &&
      row.retailPrice >= 0 &&
      !priceFloorOk(row.retailPrice, row.costPrice, minMarginPct)
    ) {
      priceFloorViolation = true;
      if (!allowFloor) {
        errors.push(
          `Price floor violated: Retail must be ≥ Cost × (1 + ${minMarginPct}% margin)`,
        );
      }
    }

    if (errors.length > 0) {
      results.push({
        rowNumber: row.rowNumber,
        action: "error",
        sku: row.internalCode || sku,
        errorReason: errors.join("; "),
        priceFloorViolation,
      });
      continue;
    }

    results.push({
      rowNumber: row.rowNumber,
      action,
      sku,
      priceFloorViolation,
      previousProductSnapshot: existingProduct,
      payload: {
        sku,
        name: row.name,
        category,
        unit,
        brand: row.brand,
        concentration: row.concentration,
        costFifo: row.costPrice!,
        sellPrice: row.retailPrice!,
        wholesalePrice: row.wholesalePrice ?? 0,
        gender: row.gender,
        size: row.size,
        collection: row.collection,
        notes: row.notes,
        itemType: itemType!,
        minMarginPct,
      },
    });
  }

  return results;
}

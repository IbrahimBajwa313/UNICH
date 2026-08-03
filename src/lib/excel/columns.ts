import type { Concentration, ItemType, ProductCategory, StockUnit } from "@/lib/types";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Brand Perfumes",
  "Signature Brand",
  "Customized Perfumes",
  "Perfume Oils",
  "Oud Oils",
  "Itar",
  "Body Mist",
  "Roll-ons",
  "Deodorants",
  "Bakhoor",
  "Incense Burners",
  "Gift Boxes",
  "Perfume Sets",
  "Single Notes",
  "Mass Perfumes",
  "Packaging",
];

export const STOCK_UNITS: StockUnit[] = ["ml", "pcs", "g", "kg"];

export const CONCENTRATIONS: Concentration[] = [
  "EDT",
  "EDP",
  "Extrait",
  "Parfum",
  "Oil",
  "Mist",
  "Other",
];

export const ITEM_TYPES: ItemType[] = ["finished", "packaging", "raw"];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  finished: "Finished Product",
  packaging: "Packaging Component",
  raw: "Raw Material",
};

export const OIL_CATEGORIES = new Set<ProductCategory>([
  "Perfume Oils",
  "Oud Oils",
  "Single Notes",
  "Itar",
]);

export const PCS_PREFERRED_CATEGORIES = new Set<ProductCategory>([
  "Brand Perfumes",
  "Signature Brand",
  "Gift Boxes",
  "Perfume Sets",
  "Packaging",
  "Incense Burners",
]);

/** Fixed Excel headers — order matters for template + parse. */
export const EXCEL_HEADERS = [
  "Internal Code",
  "Product Name",
  "Category",
  "Brand",
  "Concentration",
  "Unit",
  "Cost Price",
  "Retail Price",
  "Wholesale Price",
  "Gender",
  "Size",
  "Collection",
  "Notes",
  "Item Type",
] as const;

export type ExcelHeader = (typeof EXCEL_HEADERS)[number];

export interface ExcelProductRow {
  rowNumber: number;
  internalCode: string;
  name: string;
  category: string;
  brand: string;
  concentration: string;
  unit: string;
  costPrice: number | null;
  retailPrice: number | null;
  wholesalePrice: number | null;
  gender: string;
  size: string;
  collection: string;
  notes: string;
  itemType: string;
}

export function itemTypeFromLabel(value: string): ItemType | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "finished" || v === "finished product") return "finished";
  if (v === "packaging" || v === "packaging component") return "packaging";
  if (v === "raw" || v === "raw material") return "raw";
  return null;
}

export function itemTypeToLabel(t: ItemType): string {
  return ITEM_TYPE_LABELS[t];
}

export function categoryCode(category: string): string {
  const map: Record<string, string> = {
    "Brand Perfumes": "BP",
    "Signature Brand": "SB",
    "Customized Perfumes": "CP",
    "Perfume Oils": "PO",
    "Oud Oils": "OO",
    Itar: "IT",
    "Body Mist": "BM",
    "Roll-ons": "RO",
    Deodorants: "DE",
    Bakhoor: "BK",
    "Incense Burners": "IB",
    "Gift Boxes": "GB",
    "Perfume Sets": "PS",
    "Single Notes": "SN",
    "Mass Perfumes": "MP",
    Packaging: "PK",
  };
  return map[category] || "XX";
}

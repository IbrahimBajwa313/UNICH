import * as XLSX from "xlsx";
import {
  CONCENTRATIONS,
  EXCEL_HEADERS,
  ITEM_TYPE_LABELS,
  PRODUCT_CATEGORIES,
  STOCK_UNITS,
  itemTypeToLabel,
  type ExcelHeader,
} from "@/lib/excel/columns";
import type { ItemType, Product } from "@/lib/types";

function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer;
  return Buffer.from(out);
}

function applyDataValidations(ws: XLSX.WorkSheet, maxRow: number) {
  // SheetJS community: store validation ranges for Excel-compatible clients that honor them.
  const validations = [
    { sqref: `C2:C${maxRow}`, formula: "Lists!$A$2:$A$100" }, // Category
    { sqref: `E2:E${maxRow}`, formula: "Lists!$B$2:$B$50" }, // Concentration
    { sqref: `F2:F${maxRow}`, formula: "Lists!$C$2:$C$10" }, // Unit
    { sqref: `N2:N${maxRow}`, formula: "Lists!$D$2:$D$10" }, // Item Type
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any)["!dataValidation"] = validations.map((v) => ({
    sqref: v.sqref,
    type: "list",
    allowBlank: true,
    formula1: v.formula,
  }));
}

export function buildTemplateWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();

  const productsAoA: string[][] = [EXCEL_HEADERS as unknown as string[]];
  // sample blank rows for typing
  for (let i = 0; i < 5; i++) productsAoA.push(EXCEL_HEADERS.map(() => ""));
  const productsWs = XLSX.utils.aoa_to_sheet(productsAoA);
  productsWs["!cols"] = EXCEL_HEADERS.map((h) => ({
    wch: Math.max(14, h.length + 2),
  }));
  applyDataValidations(productsWs, 1000);

  const listsAoA: (string | number)[][] = [
    ["Category", "Concentration", "Unit", "Item Type"],
  ];
  const maxLen = Math.max(
    PRODUCT_CATEGORIES.length,
    CONCENTRATIONS.length,
    STOCK_UNITS.length,
    Object.keys(ITEM_TYPE_LABELS).length,
  );
  const itemLabels = Object.values(ITEM_TYPE_LABELS);
  for (let i = 0; i < maxLen; i++) {
    listsAoA.push([
      PRODUCT_CATEGORIES[i] || "",
      CONCENTRATIONS[i] || "",
      STOCK_UNITS[i] || "",
      itemLabels[i] || "",
    ]);
  }
  const listsWs = XLSX.utils.aoa_to_sheet(listsAoA);

  const instructions = XLSX.utils.aoa_to_sheet([
    ["U-niche Product Import Template"],
    [""],
    ["1. Fill the Products sheet — one product per row."],
    ["2. Leave Internal Code blank to CREATE; fill SKU to UPDATE."],
    ["3. Use Lists sheet values for Category, Concentration, Unit, Item Type."],
    ["4. Single Notes (raw perfume/oud/itar oils) must use Unit = ml; Size multiples of 5."],
    ["5. Brands / Signature Brand / Niche Brand / Coffret / Packaging should use Unit = pcs."],
    ["6. Retail Price must respect price floor vs Cost (admin password can override on commit)."],
    ["7. Upload via Inventory → Import Excel for staging preview before commit."],
  ]);

  XLSX.utils.book_append_sheet(wb, productsWs, "Products");
  XLSX.utils.book_append_sheet(wb, listsWs, "Lists");
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");
  return workbookToBuffer(wb);
}

export function buildCatalogueExport(products: Product[]): Buffer {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [EXCEL_HEADERS as unknown as string[]];
  for (const p of products) {
    const itemType = (p.itemType || "finished") as ItemType;
    rows.push([
      p.sku,
      p.name,
      p.category,
      p.brand || "",
      p.concentration || "",
      p.unit,
      p.costFifo,
      p.sellPrice,
      p.wholesalePrice ?? 0,
      p.gender || "",
      p.size || "",
      p.collection || "",
      p.notes || "",
      itemTypeToLabel(itemType),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = EXCEL_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  applyDataValidations(ws, Math.max(rows.length, 2));
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return workbookToBuffer(wb);
}

export function productRowToExcelValues(
  row: Record<ExcelHeader, string | number>,
): (string | number)[] {
  return EXCEL_HEADERS.map((h) => row[h] ?? "");
}

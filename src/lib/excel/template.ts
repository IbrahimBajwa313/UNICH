import ExcelJS from "exceljs";
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

async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** Column letters matching EXCEL_HEADERS order — keep in sync if headers change. */
const COL = {
  category: "C",
  concentration: "E",
  unit: "F",
  itemType: "N",
} as const;

/**
 * Real Excel dropdown lists (not just a reference sheet) so a non-technical
 * user can only pick valid values — this prevents "Invalid Category: X" style
 * errors before the file is ever uploaded.
 */
function applyDataValidations(ws: ExcelJS.Worksheet, firstRow: number, lastRow: number) {
  const rules: Array<{ col: keyof typeof COL; formula: string }> = [
    { col: "category", formula: `Lists!$A$2:$A$${PRODUCT_CATEGORIES.length + 1}` },
    { col: "concentration", formula: `Lists!$B$2:$B$${CONCENTRATIONS.length + 1}` },
    { col: "unit", formula: `Lists!$C$2:$C$${STOCK_UNITS.length + 1}` },
    {
      col: "itemType",
      formula: `Lists!$D$2:$D$${Object.keys(ITEM_TYPE_LABELS).length + 1}`,
    },
  ];
  // ExcelJS's type defs omit `dataValidations` on Worksheet even though it exists at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataValidations = (ws as any).dataValidations as {
    add(address: string, validation: ExcelJS.DataValidation): void;
  };
  for (const rule of rules) {
    const col = COL[rule.col];
    dataValidations.add(`${col}${firstRow}:${col}${lastRow}`, {
      type: "list",
      allowBlank: true,
      formulae: [rule.formula],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Not on the list",
      error: "Please pick a value from the dropdown instead of typing your own.",
    });
  }
}

function setHeaderRow(ws: ExcelJS.Worksheet) {
  ws.addRow(EXCEL_HEADERS as unknown as string[]);
  ws.getRow(1).font = { bold: true };
  ws.columns = EXCEL_HEADERS.map((h) => ({ width: Math.max(14, h.length + 2) }));
}

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const productsWs = wb.addWorksheet("Products");
  setHeaderRow(productsWs);
  const blankRows = 5;
  for (let i = 0; i < blankRows; i++) productsWs.addRow(EXCEL_HEADERS.map(() => ""));
  applyDataValidations(productsWs, 2, 1000);

  const listsWs = wb.addWorksheet("Lists");
  listsWs.addRow(["Category", "Concentration", "Unit", "Item Type"]);
  listsWs.getRow(1).font = { bold: true };
  const maxLen = Math.max(
    PRODUCT_CATEGORIES.length,
    CONCENTRATIONS.length,
    STOCK_UNITS.length,
    Object.keys(ITEM_TYPE_LABELS).length,
  );
  const itemLabels = Object.values(ITEM_TYPE_LABELS);
  for (let i = 0; i < maxLen; i++) {
    listsWs.addRow([
      PRODUCT_CATEGORIES[i] || "",
      CONCENTRATIONS[i] || "",
      STOCK_UNITS[i] || "",
      itemLabels[i] || "",
    ]);
  }
  listsWs.columns = [
    { width: 18 },
    { width: 14 },
    { width: 10 },
    { width: 22 },
  ];

  const instructions = wb.addWorksheet("Instructions");
  const lines = [
    "U-niche Product Import Template",
    "",
    "1. Fill the Products sheet — one product per row.",
    "2. Leave Internal Code blank to CREATE; fill SKU to UPDATE.",
    "3. Category, Concentration, Unit and Item Type are dropdowns — click the cell and choose from the list, don't type your own.",
    "4. Single Notes (raw perfume/oud/itar oils) must use Unit = ml; Size multiples of 5.",
    "5. Brands / Signature Brand / Niche Brand / Coffret / Packaging should use Unit = pcs.",
    "6. Retail Price must respect price floor vs Cost (admin password can override on commit).",
    "7. Upload via Inventory → Import Excel for staging preview before commit.",
  ];
  for (const line of lines) instructions.addRow([line]);
  instructions.getRow(1).font = { bold: true, size: 13 };
  instructions.getColumn(1).width = 90;

  return workbookToBuffer(wb);
}

export async function buildCatalogueExport(products: Product[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  setHeaderRow(ws);
  for (const p of products) {
    const itemType = (p.itemType || "finished") as ItemType;
    ws.addRow([
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
  applyDataValidations(ws, 2, Math.max(products.length + 1, 2));

  const listsWs = wb.addWorksheet("Lists");
  listsWs.addRow(["Category", "Concentration", "Unit", "Item Type"]);
  listsWs.getRow(1).font = { bold: true };
  const maxLen = Math.max(
    PRODUCT_CATEGORIES.length,
    CONCENTRATIONS.length,
    STOCK_UNITS.length,
    Object.keys(ITEM_TYPE_LABELS).length,
  );
  const itemLabels = Object.values(ITEM_TYPE_LABELS);
  for (let i = 0; i < maxLen; i++) {
    listsWs.addRow([
      PRODUCT_CATEGORIES[i] || "",
      CONCENTRATIONS[i] || "",
      STOCK_UNITS[i] || "",
      itemLabels[i] || "",
    ]);
  }

  return workbookToBuffer(wb);
}

export function productRowToExcelValues(
  row: Record<ExcelHeader, string | number>,
): (string | number)[] {
  return EXCEL_HEADERS.map((h) => row[h] ?? "");
}

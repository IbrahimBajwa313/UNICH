import * as XLSX from "xlsx";
import { Product } from "@/lib/models";
import {
  buildInventoryValuation,
  type InventoryValuationReport,
  type ValuationFilterOpts,
  type ValuationProductInput,
} from "@/lib/reports/inventoryValuation";
import { toJSONList } from "@/lib/serialize";

export async function loadInventoryValuation(
  opts: ValuationFilterOpts = {},
): Promise<InventoryValuationReport> {
  const docs = await Product.find().sort({ name: 1 }).lean();
  const products = toJSONList(docs).map((p) => {
    const row = p as Record<string, unknown>;
    return {
      id: String(row.id),
      sku: String(row.sku ?? ""),
      name: String(row.name ?? ""),
      category: String(row.category ?? "Uncategorized"),
      brand: String(row.brand ?? ""),
      unit: String(row.unit ?? "pcs"),
      costFifo: Number(row.costFifo) || 0,
      stockSellable: Number(row.stockSellable) || 0,
      stockTester: Number(row.stockTester) || 0,
      stockSample: Number(row.stockSample) || 0,
      stockPersonal: Number(row.stockPersonal) || 0,
      lowStockAt: Number(row.lowStockAt) || 0,
    } satisfies ValuationProductInput;
  });
  return buildInventoryValuation(products, opts);
}

export function buildInventoryValuationExcel(
  report: InventoryValuationReport,
): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryRows: (string | number)[][] = [
    ["Category", "SKUs", "Qty", "Inventory Value", "% of Total"],
    ...report.categories.map((c) => [
      c.category,
      c.skuCount,
      Number(c.qty.toFixed(3)),
      Number(c.value.toFixed(3)),
      Number(c.shareOfTotal.toFixed(2)),
    ]),
  ];

  const detailRows: (string | number)[][] = [
    [
      "Category",
      "SKU",
      "Product",
      "Brand",
      "Unit",
      "Qty",
      "FIFO Cost",
      "Value",
      "% of Category",
    ],
    ...report.categories.flatMap((c) =>
      c.products.map((p) => [
        c.category,
        p.sku,
        p.name,
        p.brand || "—",
        p.unit,
        Number(p.qty.toFixed(3)),
        Number(p.costFifo.toFixed(3)),
        Number(p.value.toFixed(3)),
        Number(p.shareOfCategory.toFixed(2)),
      ]),
    ),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
  summarySheet["!cols"] = [
    { wch: 22 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
  ];
  detailSheet["!cols"] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 28 },
    { wch: 14 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
  ];
  summarySheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: summaryRows.length - 1, c: summaryRows[0].length - 1 },
    }),
  };
  detailSheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: detailRows.length - 1, c: detailRows[0].length - 1 },
    }),
  };

  XLSX.utils.book_append_sheet(wb, summarySheet, "Category Summary");
  XLSX.utils.book_append_sheet(wb, detailSheet, "Product Detail");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer;
  return Buffer.from(out);
}

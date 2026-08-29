import * as XLSX from "xlsx";
import { EXCEL_HEADERS } from "@/lib/excel/columns";

export interface FailedImportRow {
  rowNumber: number;
  sku?: string;
  errorReason: string;
  payload?: Record<string, unknown> | null;
}

export function buildErrorReport(failed: FailedImportRow[]): Buffer {
  const wb = XLSX.utils.book_new();
  const headers = [...EXCEL_HEADERS, "Error Reason", "Source Row"];
  const aoa: (string | number)[][] = [headers];

  for (const f of failed) {
    const p = f.payload || {};
    aoa.push([
      String(p.sku ?? f.sku ?? ""),
      String(p.name ?? ""),
      String(p.category ?? ""),
      String(p.brand ?? ""),
      String(p.concentration ?? ""),
      String(p.unit ?? ""),
      (p.costFifo as number) ?? "",
      (p.sellPrice as number) ?? "",
      (p.wholesalePrice as number) ?? "",
      String(p.gender ?? ""),
      String(p.size ?? ""),
      String(p.collection ?? ""),
      String(p.notes ?? ""),
      String(p.itemType ?? ""),
      f.errorReason,
      f.rowNumber,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Failed Rows");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer;
  return Buffer.from(out);
}

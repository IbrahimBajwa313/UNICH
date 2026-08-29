import type { ReportResult } from "../types";

function escapeCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportToCsv(result: ReportResult): string {
  const header = result.columns.map((c) => escapeCell(c.label)).join(",");
  const lines = result.rows.map((row) =>
    result.columns.map((c) => escapeCell(row[c.key] ?? "")).join(","),
  );
  return [header, ...lines].join("\r\n");
}

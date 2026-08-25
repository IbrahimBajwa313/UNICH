"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { EmptyState } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { clsx, formatDate, formatMoney } from "@/lib/format";
import {
  REPORT_PERIODS,
  toDateInputValue,
  type ReportPeriod,
} from "@/lib/reports/period";
import type { Branch } from "@/lib/types";

type ReportColumnType = "string" | "number" | "currency" | "percent" | "date";

type ReportColumn = { key: string; label: string; type: ReportColumnType };

type ReportCatalogEntry = {
  id: string;
  label: string;
  description: string;
  category: string;
  columns: ReportColumn[];
};

type ReportRow = Record<string, string | number | null>;

type ReportResult = {
  id: string;
  label: string;
  category: string;
  generatedAt: string;
  range: { from: string; to: string };
  branchId: string | null;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  compareTotals: Record<string, number> | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales",
  inventory: "Inventory",
  profit: "Profit & margin",
  purchase: "Purchasing",
  customer: "Customers",
  finance: "Finance",
  production: "Production",
  hr: "HR",
  branch: "Branch performance",
};

const selectClass =
  "h-10 rounded-full border border-line bg-mist px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";

const numericTypes = new Set<ReportColumnType>(["number", "currency", "percent"]);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderCell(value: string | number | null, type: ReportColumnType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "currency") return formatMoney(Number(value));
  if (type === "percent") return `${Number(value).toFixed(1)}%`;
  if (type === "date") return typeof value === "string" ? formatDate(value) : String(value);
  return String(value);
}

export function ReportCenter() {
  const catalog = useApiData<{ reports: ReportCatalogEntry[] }>("/api/reports/engine");
  const branchesData = useApiData<Branch[]>("/api/branches");

  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("report"),
  );
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [branchId, setBranchId] = useState("");
  const [compare, setCompare] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reports = catalog.data?.reports ?? [];
  const branches = branchesData.data ?? [];
  const effectiveId = selectedId ?? reports[0]?.id ?? null;

  const grouped = useMemo(() => {
    const map = new Map<string, ReportCatalogEntry[]>();
    for (const r of reports) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return map;
  }, [reports]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ period, date });
    if (branchId) p.set("branchId", branchId);
    if (compare) p.set("compare", "1");
    return p.toString();
  }, [period, date, branchId, compare]);

  const resultUrl = effectiveId ? `/api/reports/engine/${effectiveId}?${query}` : null;
  const result = useApiData<ReportResult>(resultUrl);

  async function exportCsv() {
    if (!effectiveId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/reports/engine/${effectiveId}?${query}&format=csv`, {
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Export failed");
      }
      const blob = await res.blob();
      downloadBlob(blob, `${effectiveId}-${period}-${date}.csv`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const data = result.data;

  return (
    <Panel padding={false} className="overflow-hidden">
      <div className="border-b border-line/70 bg-gradient-to-r from-mist/80 to-transparent px-5 py-4">
        <PanelHeader
          title="Report Center"
          subtitle="Every report your role can run — pick one, choose a range, export to CSV."
        />
      </div>

      <div className="flex flex-col gap-5 px-5 py-4 lg:flex-row">
        <aside className="lg:w-64 lg:shrink-0">
          {catalog.loading ? (
            <LoadingState label="Loading reports…" />
          ) : catalog.error ? (
            <ErrorState message={catalog.error} onRetry={() => void catalog.reload()} />
          ) : reports.length === 0 ? (
            <EmptyState
              title="No reports available"
              detail="Your role doesn't have access to any Report Center reports."
            />
          ) : (
            <nav className="space-y-4">
              {Array.from(grouped.entries()).map(([category, items]) => (
                <div key={category}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    {CATEGORY_LABELS[category] || category}
                  </p>
                  <div className="space-y-1">
                    {items.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        title={r.description}
                        className={clsx(
                          "block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                          effectiveId === r.id
                            ? "bg-gold/15 text-ink"
                            : "text-ink-muted hover:bg-mist",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {effectiveId ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
                  className={selectClass}
                  aria-label="Period"
                >
                  {REPORT_PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={selectClass}
                  aria-label="Anchor date"
                />
                {branches.length > 1 ? (
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className={selectClass}
                    aria-label="Branch"
                  >
                    <option value="">All branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={(e) => setCompare(e.target.checked)}
                  />
                  Compare to previous period
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={exporting || result.loading || !data?.rows.length}
                  onClick={() => void exportCsv()}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporting ? "Exporting…" : "CSV"}
                </Button>
              </div>

              {result.loading && !data ? (
                <LoadingState label="Running report…" />
              ) : result.error && !data ? (
                <ErrorState message={result.error} onRetry={() => void result.reload()} />
              ) : data && data.rows.length === 0 ? (
                <EmptyState
                  title="No data"
                  detail="Nothing found for this range. Try another period, date, or branch."
                />
              ) : data ? (
                <div className="overflow-x-auto rounded-[var(--radius)] border border-line/60">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
                      <tr>
                        {data.columns.map((c) => (
                          <th
                            key={c.key}
                            className={clsx(
                              "px-4 py-2.5 font-medium",
                              numericTypes.has(c.type) && "text-right",
                            )}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, i) => (
                        <tr key={i} className="border-t border-line/60">
                          {data.columns.map((c) => (
                            <td
                              key={c.key}
                              className={clsx(
                                "px-4 py-3",
                                numericTypes.has(c.type) && "text-right font-medium",
                              )}
                            >
                              {renderCell(row[c.key], c.type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {Object.keys(data.totals).length > 0 ? (
                      <tfoot className="border-t border-line bg-mist/40 font-semibold">
                        <tr>
                          {data.columns.map((c, i) => (
                            <td
                              key={c.key}
                              className={clsx(
                                "px-4 py-2.5",
                                numericTypes.has(c.type) && "text-right",
                              )}
                            >
                              {i === 0
                                ? "Total"
                                : c.key in data.totals
                                  ? renderCell(data.totals[c.key], c.type)
                                  : ""}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

import type { AppSession } from "@/lib/auth/session";

/**
 * Report categories are deliberately a separate axis from the app's
 * existing `Permission` union in `@/lib/auth/roles` — that file is not
 * touched by the reporting engine. See `access.ts`.
 */
export type ReportCategory =
  | "sales"
  | "inventory"
  | "profit"
  | "purchase"
  | "customer"
  | "finance"
  | "production"
  | "hr"
  | "branch";

export type ReportColumnType = "string" | "number" | "currency" | "percent" | "date";

export type ReportColumn = {
  key: string;
  label: string;
  type: ReportColumnType;
};

export type ReportRow = Record<string, string | number | null>;

export type ReportFilters = {
  from: Date;
  to: Date;
  branchId: string | null;
  compare: boolean;
  extra: Record<string, string>;
};

export type ReportResult = {
  id: string;
  label: string;
  category: ReportCategory;
  generatedAt: string;
  range: { from: string; to: string };
  branchId: string | null;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  compareTotals: Record<string, number> | null;
};

export type ReportContext = {
  session: AppSession;
};

export type ReportDefinition = {
  id: string;
  label: string;
  description: string;
  category: ReportCategory;
  /** When true, a role without all-branch access is forced to its own branch. */
  branchScoped: boolean;
  columns: ReportColumn[];
  run: (ctx: ReportContext, filters: ReportFilters) => Promise<{
    rows: ReportRow[];
    totals: Record<string, number>;
  }>;
};

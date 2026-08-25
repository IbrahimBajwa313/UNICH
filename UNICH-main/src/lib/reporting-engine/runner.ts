import { canAccessReportCategory, resolveBranchScope } from "./access";
import { ReportAccessDeniedError, ReportNotFoundError } from "./errors";
import { previousPeriodFilters } from "./filters";
import { getReport } from "./registry";
import type { ReportContext, ReportFilters, ReportResult } from "./types";

export async function executeReport(
  id: string,
  ctx: ReportContext,
  rawFilters: ReportFilters,
): Promise<ReportResult> {
  const definition = getReport(id);
  if (!definition) throw new ReportNotFoundError(id);

  if (!canAccessReportCategory(ctx.session.role, definition.category)) {
    throw new ReportAccessDeniedError(id);
  }

  const branchId = definition.branchScoped
    ? resolveBranchScope(ctx.session, rawFilters.branchId)
    : rawFilters.branchId;
  const filters: ReportFilters = { ...rawFilters, branchId };

  const { rows, totals } = await definition.run(ctx, filters);

  let compareTotals: Record<string, number> | null = null;
  if (filters.compare) {
    const prev = previousPeriodFilters(filters);
    compareTotals = (await definition.run(ctx, prev)).totals;
  }

  return {
    id: definition.id,
    label: definition.label,
    category: definition.category,
    generatedAt: new Date().toISOString(),
    range: { from: filters.from.toISOString(), to: filters.to.toISOString() },
    branchId: filters.branchId,
    columns: definition.columns,
    rows,
    totals,
    compareTotals,
  };
}

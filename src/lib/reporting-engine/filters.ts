import {
  getPeriodRange,
  parseAnchorDate,
  parseReportPeriod,
} from "@/lib/reports/period";
import type { ReportFilters } from "./types";

/**
 * Query params understood by every engine report:
 *   period=daily|weekly|monthly|yearly (default daily), date=YYYY-MM-DD (anchor)
 *   from=YYYY-MM-DD & to=YYYY-MM-DD (explicit range, overrides period/date)
 *   branchId=<id>, compare=1
 * Anything else lands in `extra` for a specific report's own use.
 */
export function parseReportFilters(searchParams: URLSearchParams): ReportFilters {
  const KNOWN = new Set(["period", "date", "from", "to", "branchId", "compare"]);

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let from: Date;
  let to: Date;
  if (fromParam && toParam) {
    from = parseAnchorDate(fromParam);
    from.setHours(0, 0, 0, 0);
    to = parseAnchorDate(toParam);
    to.setHours(23, 59, 59, 999);
  } else {
    const period = parseReportPeriod(searchParams.get("period"));
    const anchor = parseAnchorDate(searchParams.get("date"));
    const range = getPeriodRange(period, anchor);
    from = range.start;
    to = range.end;
  }

  const extra: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!KNOWN.has(key)) extra[key] = value;
  }

  return {
    from,
    to,
    branchId: searchParams.get("branchId"),
    compare: searchParams.get("compare") === "1",
    extra,
  };
}

/** Same-length window immediately before `filters.from`. */
export function previousPeriodFilters(filters: ReportFilters): ReportFilters {
  const spanMs = filters.to.getTime() - filters.from.getTime();
  const to = new Date(filters.from.getTime() - 1);
  const from = new Date(to.getTime() - spanMs);
  return { ...filters, from, to, compare: false };
}

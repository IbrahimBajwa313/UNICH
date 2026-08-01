export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

export const REPORT_PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "daily", label: "Daily report" },
  { value: "weekly", label: "Weekly report" },
  { value: "monthly", label: "Monthly report" },
  { value: "yearly", label: "Yearly report" },
];

export function parseReportPeriod(value: string | null): ReportPeriod {
  if (value === "weekly" || value === "monthly" || value === "yearly") return value;
  return "daily";
}

/** Parse YYYY-MM-DD as a local calendar date; falls back to today. */
export function parseAnchorDate(value: string | null | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  return new Date();
}

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getPeriodRange(period: ReportPeriod, anchor: Date = new Date()) {
  const start = new Date(anchor);
  const end = new Date(anchor);

  if (period === "daily") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === "weekly") {
    const day = start.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - mondayOffset);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === "monthly") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

export function formatPeriodLabel(period: ReportPeriod, start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  if (period === "daily") return fmt(start);
  if (period === "yearly") return String(start.getFullYear());
  if (period === "monthly") {
    return start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

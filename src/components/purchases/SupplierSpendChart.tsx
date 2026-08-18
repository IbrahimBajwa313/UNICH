import { formatMoney } from "@/lib/format";

export interface SupplierSpendPoint {
  id: string;
  name: string;
  value: number;
}

/**
 * Ranked list + proportional bar, not an axis chart — a "who did we spend
 * the most with" leaderboard reads faster for a non-technical viewer than a
 * labelled-axis bar chart, and every value is printed, not just implied by
 * bar length.
 */
export function SupplierSpendChart({ data }: { data: SupplierSpendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-ink-muted">
        No purchases recorded yet
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <ul className="space-y-3.5">
      {data.map((s, i) => (
        <li key={s.id}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-ink">
              <span className="mr-1.5 text-ink-muted">{i + 1}.</span>
              {s.name}
            </span>
            <span className="font-semibold text-ink">{formatMoney(s.value)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${Math.max(4, Math.round((s.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

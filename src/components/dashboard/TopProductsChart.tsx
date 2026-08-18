import { formatMoneyCompact, formatQty } from "@/lib/format";

interface ProductRow {
  name: string;
  qty: number;
  unit: string;
  revenue: number;
}

export function TopProductsChart({ data }: { data: ProductRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
        No items sold yet today
      </div>
    );
  }

  const max = Math.max(1, ...data.map((row) => row.revenue));

  return (
    <ul className="space-y-3.5">
      {data.map((row) => {
        const pct = Math.max(2, Math.round((row.revenue / max) * 100));
        return (
          <li
            key={row.name}
            title={`${row.name}: ${formatMoneyCompact(row.revenue)} · ${formatQty(row.qty, row.unit)} sold`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-ink">{row.name}</span>
              <span className="shrink-0 text-ink-muted">
                {formatMoneyCompact(row.revenue)}
                <span className="ml-1 text-ink-muted/70">
                  · {formatQty(row.qty, row.unit)}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

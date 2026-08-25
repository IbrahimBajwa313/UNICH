import { formatMoneyCompact } from "@/lib/format";

interface CategoryRow {
  category: string;
  value: number;
  count: number;
}

export function StockByCategoryChart({ data }: { data: CategoryRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
        No inventory value yet
      </div>
    );
  }

  const max = Math.max(1, ...data.map((row) => row.value));

  return (
    <ul className="space-y-3.5">
      {data.map((row) => {
        const pct = Math.max(2, Math.round((row.value / max) * 100));
        return (
          <li
            key={row.category}
            title={`${row.category}: ${formatMoneyCompact(row.value)} · ${row.count} SKU${row.count === 1 ? "" : "s"}`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-ink">{row.category}</span>
              <span className="shrink-0 text-ink-muted">
                {formatMoneyCompact(row.value)}
                <span className="ml-1 text-ink-muted/70">· {row.count}</span>
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

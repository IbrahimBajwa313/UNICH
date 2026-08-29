import { formatQty } from "@/lib/format";
import type { StockUnit } from "@/lib/types";

interface LowStockItem {
  id: string;
  name: string;
  stockSellable: number;
  lowStockAt: number;
  unit: StockUnit;
}

export function LowStockWatchlist({ items }: { items: LowStockItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-center text-sm text-ink-muted">
        All SKUs are above their reorder threshold
      </div>
    );
  }

  return (
    <ul className="space-y-3.5">
      {items.slice(0, 6).map((item) => {
        const pct = item.lowStockAt > 0 ? (item.stockSellable / item.lowStockAt) * 100 : 0;
        const critical = item.stockSellable === 0 || pct <= 50;
        return (
          <li
            key={item.id}
            title={`${item.name}: ${formatQty(item.stockSellable, item.unit)} of ${formatQty(item.lowStockAt, item.unit)} threshold`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-ink">{item.name}</span>
              <span className="shrink-0 text-ink-muted">
                {formatQty(item.stockSellable, item.unit)} / {formatQty(item.lowStockAt, item.unit)}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-mist">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${critical ? "bg-coral" : "bg-amber"}`}
                style={{ width: `${Math.max(3, Math.min(100, Math.round(pct)))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

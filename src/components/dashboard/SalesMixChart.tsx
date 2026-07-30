import { formatMoney } from "@/lib/format";
import type { SalesPoint } from "@/lib/types";

const CHART_HEIGHT = 176;

export function SalesMixChart({ data }: { data: SalesPoint[] }) {
  const maxBar = Math.max(
    1,
    ...data.map((d) => d.retail + d.wholesale + d.remix),
  );

  if (data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-ink-muted">
        No sales data for this period
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-3" style={{ height: CHART_HEIGHT }}>
        {data.map((day, index) => {
          const total = day.retail + day.wholesale + day.remix;
          const barHeight =
            total <= 0
              ? 3
              : Math.max(10, Math.round((total / maxBar) * (CHART_HEIGHT - 28)));

          const retailH =
            total > 0 ? Math.round((day.retail / total) * barHeight) : 0;
          const wholesaleH =
            total > 0 ? Math.round((day.wholesale / total) * barHeight) : 0;
          const remixH = Math.max(0, barHeight - retailH - wholesaleH);

          return (
            <div
              key={`${day.label}-${index}`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              <div
                className="group relative flex w-full max-w-[48px] flex-col justify-end overflow-hidden rounded-t-2xl"
                style={{ height: barHeight }}
                title={`${day.label}: ${formatMoney(total)}`}
              >
                {retailH > 0 ? (
                  <div
                    className="w-full bg-gold transition-opacity group-hover:opacity-90"
                    style={{ height: retailH }}
                    title={`Retail ${formatMoney(day.retail)}`}
                  />
                ) : null}
                {wholesaleH > 0 ? (
                  <div
                    className="w-full bg-gold-soft/70 transition-opacity group-hover:opacity-90"
                    style={{ height: wholesaleH }}
                    title={`Wholesale ${formatMoney(day.wholesale)}`}
                  />
                ) : null}
                {remixH > 0 ? (
                  <div
                    className="w-full bg-sage transition-opacity group-hover:opacity-90"
                    style={{ height: remixH }}
                    title={`Remix ${formatMoney(day.remix)}`}
                  />
                ) : null}
              </div>
              <span className="text-[11px] font-medium text-ink-muted">
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-gold" /> Retail
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-gold-soft/70" /> Wholesale
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-sage" /> Remix
        </span>
      </div>
    </div>
  );
}

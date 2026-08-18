import { formatMoney } from "@/lib/format";
import type { SalesPoint } from "@/lib/types";

const CHART_HEIGHT = 160;
const MIN_SEGMENT = 3;
const GAP = 2;

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
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div className="h-px w-full bg-line/50" />
          <div className="h-px w-full bg-line/30" />
          <div className="h-px w-full bg-line/50" />
        </div>

        <div className="relative flex h-full items-end gap-3">
          {data.map((day, index) => {
            const total = day.retail + day.wholesale + day.remix;
            const barHeight =
              total <= 0
                ? MIN_SEGMENT
                : Math.max(8, Math.round((total / maxBar) * CHART_HEIGHT));

            const retailH =
              total > 0
                ? Math.max(day.retail > 0 ? MIN_SEGMENT : 0, Math.round((day.retail / total) * barHeight))
                : 0;
            const wholesaleH =
              total > 0
                ? Math.max(day.wholesale > 0 ? MIN_SEGMENT : 0, Math.round((day.wholesale / total) * barHeight))
                : 0;
            const remixH = Math.max(0, barHeight - retailH - wholesaleH);

            return (
              <div
                key={`${day.label}-${index}`}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <div
                  className="flex w-full max-w-[36px] flex-col justify-end"
                  style={{ height: barHeight }}
                  title={`${day.label}: ${formatMoney(total)}`}
                >
                  {retailH > 0 ? (
                    <div
                      className="w-full rounded-t-[4px] bg-gold transition-opacity hover:opacity-80"
                      style={{ height: retailH, marginBottom: wholesaleH + remixH > 0 ? GAP : 0 }}
                      title={`Retail: ${formatMoney(day.retail)}`}
                    />
                  ) : null}
                  {wholesaleH > 0 ? (
                    <div
                      className={`w-full bg-gold-soft transition-opacity hover:opacity-80 ${retailH === 0 ? "rounded-t-[4px]" : ""}`}
                      style={{ height: wholesaleH, marginBottom: remixH > 0 ? GAP : 0 }}
                      title={`Wholesale: ${formatMoney(day.wholesale)}`}
                    />
                  ) : null}
                  {remixH > 0 ? (
                    <div
                      className={`w-full bg-sage transition-opacity hover:opacity-80 ${retailH === 0 && wholesaleH === 0 ? "rounded-t-[4px]" : ""}`}
                      style={{ height: remixH }}
                      title={`Remix: ${formatMoney(day.remix)}`}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex gap-3">
        {data.map((day, index) => (
          <span
            key={`${day.label}-${index}-label`}
            className="min-w-0 flex-1 text-center text-[11px] font-medium text-ink-muted"
          >
            {day.label}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-gold" /> Retail
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-gold-soft" /> Wholesale
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-sage" /> Remix
        </span>
      </div>
    </div>
  );
}

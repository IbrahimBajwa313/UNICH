import { formatMoney } from "@/lib/format";

interface PaymentRow {
  method: string;
  amount: number;
  count: number;
}

// Fixed identity → hue mapping (payment method enum), never reassigned by
// data order — a method keeps its color whether or not others show up today.
const METHOD_STYLE: Record<string, { stroke: string; dot: string }> = {
  Cash: { stroke: "stroke-gold", dot: "bg-gold" },
  Card: { stroke: "stroke-sage", dot: "bg-sage" },
  Bank: { stroke: "stroke-amber", dot: "bg-amber" },
  Credit: { stroke: "stroke-coral", dot: "bg-coral" },
  Mixed: { stroke: "stroke-ink-soft", dot: "bg-ink-soft" },
};
const FALLBACK_STYLE = { stroke: "stroke-ink-soft", dot: "bg-ink-soft" };

const SIZE = 148;
const STROKE_WIDTH = 16;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 3;

export function PaymentMixChart({ data }: { data: PaymentRow[] }) {
  const total = data.reduce((s, row) => s + row.amount, 0);

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
        No completed sales yet today
      </div>
    );
  }

  let drawn = 0;

  return (
    <div>
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE_WIDTH}
            className="fill-none stroke-line/60"
          />
          {total > 0 &&
            data.map((row) => {
              if (row.amount <= 0) return null;
              const style = METHOD_STYLE[row.method] || FALLBACK_STYLE;
              const share = row.amount / total;
              const length = Math.max(0, share * CIRCUMFERENCE - SEGMENT_GAP);
              const dashOffset = -drawn;
              drawn += share * CIRCUMFERENCE;
              return (
                <circle
                  key={row.method}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className={`fill-none ${style.stroke} transition-[stroke-dashoffset] duration-700 ease-out`}
                >
                  <title>{`${row.method}: ${formatMoney(row.amount)} · ${row.count} sale${row.count === 1 ? "" : "s"}`}</title>
                </circle>
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tracking-tight text-ink">
            {formatMoney(total)}
          </span>
          <span className="text-[11px] text-ink-muted">today</span>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-xs">
        {data.map((row) => {
          const style = METHOD_STYLE[row.method] || FALLBACK_STYLE;
          return (
            <li key={row.method} className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                {row.method}
                <span className="text-ink-muted/70">· {row.count}</span>
              </span>
              <span className="font-medium text-ink">{formatMoney(row.amount)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

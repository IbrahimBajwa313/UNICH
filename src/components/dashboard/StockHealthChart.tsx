interface StockHealth {
  healthy: number;
  low: number;
  out: number;
}

const SEGMENTS: {
  key: keyof StockHealth;
  label: string;
  stroke: string;
  dot: string;
}[] = [
  { key: "healthy", label: "Healthy", stroke: "stroke-sage", dot: "bg-sage" },
  { key: "low", label: "Low stock", stroke: "stroke-amber", dot: "bg-amber" },
  { key: "out", label: "Out of stock", stroke: "stroke-coral", dot: "bg-coral" },
];

const SIZE = 148;
const STROKE_WIDTH = 16;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 3;

export function StockHealthChart({ data }: { data: StockHealth }) {
  const total = data.healthy + data.low + data.out;
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
            SEGMENTS.map((seg) => {
              const value = data[seg.key];
              if (value <= 0) return null;
              const share = value / total;
              const length = Math.max(0, share * CIRCUMFERENCE - SEGMENT_GAP);
              const dashOffset = -drawn;
              drawn += share * CIRCUMFERENCE;
              return (
                <circle
                  key={seg.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className={`fill-none ${seg.stroke} transition-[stroke-dashoffset] duration-700 ease-out`}
                >
                  <title>{`${seg.label}: ${value} SKU${value === 1 ? "" : "s"}`}</title>
                </circle>
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight text-ink">{total}</span>
          <span className="text-[11px] text-ink-muted">SKUs tracked</span>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-xs">
        {SEGMENTS.map((seg) => (
          <li key={seg.key} className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className={`h-2 w-2 rounded-full ${seg.dot}`} />
              {seg.label}
            </span>
            <span className="font-medium text-ink">{data[seg.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ProgressRingTone = "gold" | "sage" | "coral";

const TONE_STROKE: Record<ProgressRingTone, string> = {
  gold: "stroke-gold",
  sage: "stroke-sage",
  coral: "stroke-coral",
};

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressRingTone;
  className?: string;
}

/** Bare ring + centered percentage — compose label/caption around it at the call site. */
export function ProgressRing({
  value,
  size = 128,
  strokeWidth = 12,
  tone = "gold",
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={`relative ${className ?? ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-line/60"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`fill-none ${TONE_STROKE[tone]} transition-[stroke-dashoffset] duration-700 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tracking-tight text-ink">
          {value.toFixed(1)}
          <span className="text-sm font-medium text-ink-muted">%</span>
        </span>
      </div>
    </div>
  );
}

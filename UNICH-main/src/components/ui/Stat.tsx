import { clsx } from "@/lib/format";

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  trendUp?: boolean;
  className?: string;
  delay?: string;
}

export function Stat({
  label,
  value,
  hint,
  trend,
  trendUp,
  className,
  delay,
}: StatProps) {
  return (
    <div
      className={clsx(
        "animate-fade-up rounded-[var(--radius)] border border-line/80 bg-paper p-5 shadow-[var(--shadow-soft)]",
        delay,
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold-deep">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {trend ? (
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 font-medium",
              trendUp
                ? "bg-sage-soft text-sage"
                : "bg-coral-soft text-coral",
            )}
          >
            {trend}
          </span>
        ) : null}
        {hint ? <span className="text-ink-muted">{hint}</span> : null}
      </div>
    </div>
  );
}

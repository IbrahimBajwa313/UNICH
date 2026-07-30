import { clsx } from "@/lib/format";

interface BadgeProps {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "gold" | "info";
  className?: string;
}

const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-mist text-ink-muted border-line",
  success: "bg-sage-soft text-sage border-sage/25",
  warning: "bg-amber-soft text-amber border-amber/25",
  danger: "bg-coral-soft text-coral border-coral/25",
  gold: "bg-gold/15 text-gold-soft border-gold/30",
  info: "bg-gold/10 text-ink-soft border-gold/20",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

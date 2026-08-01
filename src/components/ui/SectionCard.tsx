import { clsx } from "@/lib/format";

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  /** `accent` reserves the violet tint for sections that need emphasis. */
  tone?: "plain" | "accent";
  active?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function SectionCard({
  icon,
  title,
  subtitle,
  badge,
  tone = "plain",
  active = false,
  className,
  children,
}: SectionCardProps) {
  const accent = tone === "accent";
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3.5 transition",
        accent && active
          ? "border-gold/50 bg-gold/10 shadow-[inset_0_0_0_1px_rgb(123_97_255_/_15%)]"
          : accent
            ? "border-gold/25 bg-gold/[0.06]"
            : "border-line/70 bg-mist/30",
        className,
      )}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span
          className={clsx(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gold-deep",
            accent && active ? "bg-gold/25" : accent ? "bg-gold/15" : "bg-gold/10",
          )}
        >
          {icon}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{title}</p>
            {badge}
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-deep">
      {children}
      {hint}
    </span>
  );
}

export function FieldPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gold/25 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-gold-deep">
      {children}
    </span>
  );
}

export const fieldClass =
  "h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/20";

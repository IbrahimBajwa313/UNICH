import { clsx } from "@/lib/format";
import { forwardRef } from "react";

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  function Panel({ children, className, padding = true }, ref) {
    return (
      <div
        ref={ref}
        className={clsx(
          "rounded-[var(--radius)] border border-line/80 bg-paper shadow-[var(--shadow-soft)]",
          padding && "p-5",
          className,
        )}
      >
        {children}
      </div>
    );
  },
);

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

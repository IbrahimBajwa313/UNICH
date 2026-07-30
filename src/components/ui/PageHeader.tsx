import { clsx } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  className,
}: {
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-line bg-mist/60 px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-lg font-semibold text-ink">{title}</p>
      {detail ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{detail}</p> : null}
    </div>
  );
}

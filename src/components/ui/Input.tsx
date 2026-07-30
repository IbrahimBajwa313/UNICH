import { clsx } from "@/lib/format";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, id, ...props }: InputProps) {
  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="text-xs font-medium text-ink-muted">{label}</span>
      ) : null}
      <input
        id={id}
        className={clsx(
          "h-10 w-full rounded-full border border-line bg-mist px-4 text-sm text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/25",
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-10 w-full rounded-full border border-line bg-mist px-4 text-sm text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/25",
        className,
      )}
      {...props}
    />
  );
}

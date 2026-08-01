import { clsx } from "@/lib/format";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-canvas hover:bg-ink-soft shadow-sm",
  secondary:
    "bg-paper text-ink border border-line hover:border-gold/50 hover:bg-mist",
  ghost: "bg-transparent text-ink-muted hover:bg-paper hover:text-ink",
  danger: "bg-coral text-white hover:bg-[#e85a68]",
  gold: "bg-gold text-white hover:bg-gold-soft font-semibold shadow-[0_8px_24px_rgb(123_97_255_/_30%)]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5 rounded-full",
  md: "h-10 px-5 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-sm gap-2 rounded-full",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

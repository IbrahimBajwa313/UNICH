export const TOLA_ML = 12;
export const HALF_TOLA_ML = 6;
export const QUARTER_TOLA_ML = 3;

export function formatMoney(amount: number, currency = "AED"): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(amount);
}

export function formatQty(qty: number, unit: string): string {
  const value = Number.isInteger(qty) ? qty.toString() : qty.toFixed(3);
  return `${value} ${unit}`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatPhone(phone: string): string {
  return phone;
}

export function tolaToMl(unit: "tola" | "half_tola" | "quarter_tola"): number {
  if (unit === "tola") return TOLA_ML;
  if (unit === "half_tola") return HALF_TOLA_ML;
  return QUARTER_TOLA_ML;
}

export function marginPct(sell: number, cost: number): number {
  if (sell <= 0) return 0;
  return ((sell - cost) / sell) * 100;
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

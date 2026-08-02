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

/**
 * Backend-owned oil/refill ml from unitLabel — never trust client deductMl.
 * Supports: 1 Tola / ½ Tola / ¼ Tola, and explicit "N ml" labels (e.g. refill).
 */
export function resolveDeductMlFromUnitLabel(unitLabel?: string): number | null {
  if (!unitLabel?.trim()) return null;
  const t = unitLabel.trim().toLowerCase().replace(/\s+/g, " ");

  if (t === "1 tola" || t === "tola" || t === "full tola" || t === "1tola") {
    return TOLA_ML;
  }
  if (
    t.includes("½") ||
    t.includes("1/2") ||
    /\bhalf(?:\s|-)?tola\b/.test(t)
  ) {
    return HALF_TOLA_ML;
  }
  if (
    t.includes("¼") ||
    t.includes("1/4") ||
    /\bquarter(?:\s|-)?tola\b/.test(t)
  ) {
    return QUARTER_TOLA_ML;
  }

  const mlMatch = t.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (mlMatch) {
    const ml = Number(mlMatch[1]);
    if (Number.isFinite(ml) && ml > 0) return ml;
  }
  return null;
}

export function marginPct(sell: number, cost: number): number {
  if (sell <= 0) return 0;
  return ((sell - cost) / sell) * 100;
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

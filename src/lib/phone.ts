export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Digit-by-digit regex that tolerates spaces/dashes/+/country-code
 * punctuation between digits as phones are actually stored (e.g. "+971 50 123 4567").
 * A plain contiguous-digit match against such values never hits.
 */
export function loosePhoneRegex(digits: string): string {
  return digits
    .split("")
    .map((d) => escapeRegex(d))
    .join("\\D*");
}

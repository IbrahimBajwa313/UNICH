/** Digits-only phone; local leading 0 → default country from WHATSAPP_NUMBER. */
export function normalizePhone(phone: string, defaultCountry?: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  const country =
    defaultCountry ||
    (process.env.WHATSAPP_NUMBER || "92").replace(/\D/g, "").slice(0, 2) ||
    "92";

  if (digits.startsWith("0")) {
    digits = country + digits.slice(1);
  }

  return digits;
}

export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0+/, "");
}

/** Match local / international variants (last 9 digits). */
export function phonesMatch(a: string, b: string): boolean {
  const da = phoneKey(a);
  const db = phoneKey(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tail = 9;
  return da.length >= tail && db.length >= tail && da.slice(-tail) === db.slice(-tail);
}

export function storeWhatsAppNumber(): string {
  return normalizePhone(process.env.WHATSAPP_NUMBER || "");
}

import { normalizePhone, storeWhatsAppNumber } from "./phone";

export function buildWhatsAppUrl(toPhone: string, message: string): string {
  const phone = normalizePhone(toPhone);
  if (!phone) {
    throw new Error("WhatsApp recipient phone is required");
  }
  const text = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${text}`;
}

export function buildStoreWhatsAppUrl(message: string): string {
  const store = storeWhatsAppNumber();
  if (!store) {
    throw new Error("WHATSAPP_NUMBER is not configured");
  }
  return buildWhatsAppUrl(store, message);
}

export function formatQuotationMessage(input: {
  number: string;
  customerName: string;
  total: number;
  items: number;
  date?: string;
  expiry?: string;
  currency?: string;
}): string {
  const money = (n: number) =>
    new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: input.currency || "AED",
      minimumFractionDigits: 2,
    }).format(n);

  const store = storeWhatsAppNumber();
  return [
    `UNICH Quotation ${input.number}`,
    `Hi ${input.customerName},`,
    ``,
    `Items: ${input.items}`,
    `Total: ${money(input.total)}`,
    input.date ? `Date: ${input.date}` : null,
    input.expiry ? `Valid until: ${input.expiry}` : null,
    store ? `Reply on WhatsApp: +${store}` : null,
    ``,
    `Please reply to confirm or request changes.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatQuotationSms(input: {
  number: string;
  total: number;
  items: number;
  expiry?: string;
  currency?: string;
}): string {
  const currency = input.currency || "AED";
  const store = storeWhatsAppNumber();
  return [
    `UNICH Quotation ${input.number}:`,
    `${input.items} item(s) · ${currency} ${input.total.toFixed(2)}`,
    input.expiry ? `valid until ${input.expiry}` : "",
    store ? `Reply: +${store}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
}

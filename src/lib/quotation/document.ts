import { receiptStoreFromSettings, type ReceiptSettingsInput } from "@/lib/receipt/document";
import type { ReceiptStore } from "@/lib/receipt/types";
import { computeQuotationTotals } from "./calc";

export type QuotationDocLine = {
  name: string;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  charges: number;
  note?: string;
};

export type QuotationDoc = {
  number: string;
  version: number;
  status: string;
  date: string;
  expiry: string;
  store: ReceiptStore;
  customer: {
    name: string;
    phone: string;
    email: string;
    trn: string;
    address: string;
  };
  customerPoNumber: string;
  lines: QuotationDocLine[];
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  total: number;
  paymentTerms: string;
  deliveryTerms: string;
  validityDays: number;
  termsText: string;
  notes: string;
  signatureDataUrl: string;
  signedByName: string;
  signedAt: string;
};

export function buildQuotationDoc(input: {
  number: string;
  version?: number;
  status?: string;
  date?: Date | string;
  expiry?: Date | string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    trn?: string;
    address?: string;
  };
  customerPoNumber?: string;
  lines: QuotationDocLine[];
  vatPercent?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  validityDays?: number;
  termsText?: string;
  notes?: string;
  signatureDataUrl?: string;
  signedByName?: string;
  signedAt?: Date | string;
  settings?: ReceiptSettingsInput | null;
}): QuotationDoc {
  const store = receiptStoreFromSettings(input.settings);
  const lines = input.lines ?? [];
  const { subtotal, vatAmount, total } = computeQuotationTotals(
    lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, charges: l.charges })),
    input.vatPercent ?? 0,
  );

  return {
    number: input.number,
    version: input.version ?? 1,
    status: input.status ?? "draft",
    date: input.date ? new Date(input.date).toISOString() : new Date().toISOString(),
    expiry: input.expiry ? new Date(input.expiry).toISOString() : new Date().toISOString(),
    store,
    customer: {
      name: input.customer.name?.trim() || "Customer",
      phone: input.customer.phone?.trim() || "",
      email: input.customer.email?.trim() || "",
      trn: input.customer.trn?.trim() || "",
      address: input.customer.address?.trim() || "",
    },
    customerPoNumber: input.customerPoNumber?.trim() || "",
    lines,
    subtotal,
    vatPercent: Math.max(0, Number(input.vatPercent ?? 0)),
    vatAmount,
    total,
    paymentTerms: input.paymentTerms?.trim() || "",
    deliveryTerms: input.deliveryTerms?.trim() || "",
    validityDays: input.validityDays ?? 14,
    termsText: input.termsText?.trim() || "",
    notes: input.notes?.trim() || "",
    signatureDataUrl: input.signatureDataUrl || "",
    signedByName: input.signedByName?.trim() || "",
    signedAt: input.signedAt ? new Date(input.signedAt).toISOString() : "",
  };
}

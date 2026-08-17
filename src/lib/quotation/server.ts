import { connectDB } from "@/lib/db";
import { AppSettings } from "@/lib/models";
import type { ReceiptSettingsInput } from "@/lib/receipt/document";
import { buildQuotationDoc, type QuotationDoc, type QuotationDocLine } from "./document";

export type QuotationSettings = ReceiptSettingsInput & {
  quotationNumberPrefix: string;
  quotationDefaultValidityDays: number;
  quotationTermsTemplate: string;
  quotationPaymentTermsPresets: string[];
  quotationDeliveryTermsPresets: string[];
};

let settingsCache: { at: number; value: QuotationSettings } | null = null;
const SETTINGS_CACHE_MS = 60_000;

export function invalidateQuotationSettingsCache() {
  settingsCache = null;
}

export async function loadQuotationSettings(): Promise<QuotationSettings> {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < SETTINGS_CACHE_MS) {
    return settingsCache.value;
  }

  await connectDB();
  const settings = await AppSettings.findOne({ key: "default" })
    .select(
      "branchName currency invoiceLanguages storeLegalName storeAddress storePhone storeTaxNumber receiptLogoUrl receiptFooter vatPercent quotationNumberPrefix quotationDefaultValidityDays quotationTermsTemplate quotationPaymentTermsPresets quotationDeliveryTermsPresets",
    )
    .lean<Record<string, unknown>>();
  const raw = settings ?? {};
  const value: QuotationSettings = {
    branchName: str(raw.branchName),
    currency: str(raw.currency) || "AED",
    invoiceLanguages: str(raw.invoiceLanguages),
    storeLegalName: str(raw.storeLegalName),
    storeAddress: str(raw.storeAddress),
    storePhone: str(raw.storePhone),
    storeTaxNumber: str(raw.storeTaxNumber),
    receiptLogoUrl: str(raw.receiptLogoUrl),
    receiptFooter: str(raw.receiptFooter),
    vatPercent: Number(raw.vatPercent ?? 0),
    quotationNumberPrefix: str(raw.quotationNumberPrefix) || "QT",
    quotationDefaultValidityDays: Number(raw.quotationDefaultValidityDays ?? 14),
    quotationTermsTemplate: str(raw.quotationTermsTemplate),
    quotationPaymentTermsPresets: Array.isArray(raw.quotationPaymentTermsPresets)
      ? (raw.quotationPaymentTermsPresets as string[])
      : [],
    quotationDeliveryTermsPresets: Array.isArray(raw.quotationDeliveryTermsPresets)
      ? (raw.quotationDeliveryTermsPresets as string[])
      : [],
  };
  settingsCache = { at: now, value };
  return value;
}

/** Builds the printable document from a persisted quotation record (lean or hydrated). */
export function quotationDocFromRecord(
  q: Record<string, unknown>,
  settings: QuotationSettings,
): QuotationDoc {
  const lines = Array.isArray(q.lines)
    ? (q.lines as Record<string, unknown>[]).map(
        (line): QuotationDocLine => ({
          name: str(line.name),
          qty: Number(line.qty ?? 0),
          unitLabel: str(line.unitLabel),
          unitPrice: Number(line.unitPrice ?? 0),
          charges: Number(line.charges ?? 0),
          note:
            [line.bottleNote, line.designNote, line.notes]
              .map((n) => str(n))
              .filter(Boolean)
              .join(" · ") || undefined,
        }),
      )
    : [];

  return buildQuotationDoc({
    number: str(q.number),
    version: Number(q.version ?? 1),
    status: str(q.status) || "draft",
    date: q.date as Date,
    expiry: q.expiry as Date,
    customer: {
      name: str(q.customerName),
      phone: str(q.customerPhone),
      email: str(q.customerEmail),
      trn: str(q.customerTrn),
      address: str(q.customerAddress),
    },
    customerPoNumber: str(q.customerPoNumber),
    lines,
    vatPercent: Number(q.vatPercent ?? 0),
    paymentTerms: str(q.paymentTerms),
    deliveryTerms: str(q.deliveryTerms),
    validityDays: Number(q.validityDays ?? settings.quotationDefaultValidityDays),
    termsText: str(q.termsText) || settings.quotationTermsTemplate,
    notes: str(q.notes),
    signatureDataUrl: str(q.signatureDataUrl),
    signedByName: str(q.signedByName),
    signedAt: q.signedAt as Date | undefined,
    settings,
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

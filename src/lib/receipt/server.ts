import { connectDB } from "@/lib/db";
import { AppSettings, Sale } from "@/lib/models";
import { buildReceiptDoc, type ReceiptSettingsInput } from "./document";
import type { ReceiptDoc, ReceiptFormat, ReceiptLine } from "./types";

export type ReceiptSettings = ReceiptSettingsInput & {
  receiptFormat: ReceiptFormat;
  autoPrintReceipt: boolean;
};

export async function loadReceiptSettings(): Promise<ReceiptSettings> {
  await connectDB();
  const settings = await AppSettings.findOne({ key: "default" }).lean<
    Record<string, unknown>
  >();
  const raw = settings ?? {};
  const format = raw.receiptFormat === "a4" ? "a4" : "thermal";
  return {
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
    receiptFormat: format,
    autoPrintReceipt: raw.autoPrintReceipt !== false,
  };
}

export function parseFormat(value: string | null | undefined): ReceiptFormat {
  return value === "a4" ? "a4" : "thermal";
}

export async function receiptDocForSale(
  saleId: string,
  options?: { reprint?: boolean; settings?: ReceiptSettings },
): Promise<ReceiptDoc | null> {
  await connectDB();
  const sale = await Sale.findById(saleId).lean<Record<string, unknown>>();
  if (!sale) return null;

  const settings = options?.settings ?? (await loadReceiptSettings());
  const lines = Array.isArray(sale.lines)
    ? (sale.lines as Record<string, unknown>[]).map(
        (line): ReceiptLine => ({
          name: str(line.name),
          qty: Number(line.qty ?? 0),
          unitLabel: str(line.unitLabel),
          unitPrice: Number(line.unitPrice ?? 0),
        }),
      )
    : [];

  return buildReceiptDoc({
    saleId,
    issuedAt: (sale.createdAt as Date) ?? new Date(),
    draft: sale.status === "held",
    reprint: Boolean(options?.reprint),
    customer: {
      name: str(sale.customerName),
      phone: str(sale.customerPhone),
    },
    salesperson: str(sale.salesperson),
    payment: str(sale.payment) || "cash",
    lines,
    total: Number(sale.total ?? 0),
    settings,
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

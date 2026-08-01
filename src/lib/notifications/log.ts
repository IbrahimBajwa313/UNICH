import { connectDB } from "@/lib/db";
import { DeliveryLog } from "@/lib/models";
import type {
  DeliveryChannel,
  DeliveryKind,
  DeliveryStatus,
} from "@/lib/types";

export type DeliveryLogEntry = {
  channel: DeliveryChannel;
  kind: DeliveryKind;
  status: DeliveryStatus;
  saleId?: string;
  quotationId?: string;
  receiptNo?: string;
  to?: string;
  format?: string;
  providerId?: string;
  error?: string;
  preview?: string;
};

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Audit trail for receipt delivery — never lets a logging failure break a send. */
export async function logDelivery(entry: DeliveryLogEntry): Promise<void> {
  try {
    await connectDB();
    await DeliveryLog.create({
      channel: entry.channel,
      kind: entry.kind,
      status: entry.status,
      saleId: OBJECT_ID.test(entry.saleId || "") ? entry.saleId : undefined,
      quotationId: OBJECT_ID.test(entry.quotationId || "")
        ? entry.quotationId
        : undefined,
      receiptNo: entry.receiptNo || "",
      to: entry.to || "",
      format: entry.format || "",
      providerId: entry.providerId || "",
      error: entry.error || "",
      preview: (entry.preview || "").slice(0, 400),
    });
  } catch (err) {
    console.error("[delivery-log] could not record entry", err);
  }
}

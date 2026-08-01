import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Customer } from "@/lib/models";
import { sendEmail } from "@/lib/notifications/email";
import { logDelivery } from "@/lib/notifications/log";
import { phonesMatch } from "@/lib/notifications/phone";
import { sendSms } from "@/lib/notifications/sms";
import {
  buildWhatsAppUrl,
  formatQuotationMessage,
  formatQuotationSms,
} from "@/lib/notifications/whatsapp";
import { buildReceiptDoc } from "@/lib/receipt/document";
import { loadReceiptSettings, receiptDocForSale } from "@/lib/receipt/server";
import { renderReceiptHtml } from "@/lib/receipt/template";
import { receiptSmsText, receiptText } from "@/lib/receipt/text";
import type { ReceiptLine } from "@/lib/receipt/types";
import type { DeliveryKind } from "@/lib/types";

type Channel = "email" | "whatsapp" | "sms";
type LegacyChannel = Channel | "both";

type Body = {
  channel?: LegacyChannel;
  channels?: Channel[];
  kind?: DeliveryKind;
  saleId?: string;
  toEmail?: string;
  toPhone?: string;
  customerName?: string;
  subject?: string;
  message?: string;
  total?: number;
  payment?: string;
  salesperson?: string;
  lines?: ReceiptLine[];
  quotation?: {
    id?: string;
    number: string;
    items: number;
    date?: string;
    expiry?: string;
  };
};

type ChannelResult = {
  ok: boolean;
  error?: string;
  to?: string;
  id?: string;
  url?: string;
};

const ALL_CHANNELS: Channel[] = ["email", "whatsapp", "sms"];

function resolveChannels(body: Body): Channel[] {
  if (Array.isArray(body.channels) && body.channels.length > 0) {
    const picked = body.channels.filter((c): c is Channel =>
      ALL_CHANNELS.includes(c),
    );
    if (picked.length > 0) return Array.from(new Set(picked));
  }
  if (body.channel === "both") return ["email", "whatsapp"];
  if (body.channel && ALL_CHANNELS.includes(body.channel)) return [body.channel];
  return ["whatsapp"];
}

async function findCustomerByPhone(phone: string) {
  const exact = await Customer.findOne({ phone });
  if (exact) return exact;

  const candidates = await Customer.find({}).select("name phone email").lean();
  const match = candidates.find((c) => phonesMatch(c.phone || "", phone));
  if (!match) return null;
  return Customer.findById(match._id);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const channels = resolveChannels(body);
    const kind: DeliveryKind = body.kind || "custom";

    const toPhone = body.toPhone?.trim() || "";
    let toEmail = body.toEmail?.trim() || "";
    let customerName = body.customerName?.trim() || "";

    if (toPhone) {
      await connectDB();
      const customer = await findCustomerByPhone(toPhone);
      if (customer) {
        if (!toEmail && customer.email) toEmail = customer.email;
        if (!customerName) customerName = customer.name;
        if (toEmail && !customer.email) {
          customer.email = toEmail;
          await customer.save();
        }
      }
    }

    const content = await buildContent({
      body,
      kind,
      toPhone,
      toEmail,
      customerName,
    });

    const results: Partial<Record<Channel, ChannelResult>> = {};

    if (channels.includes("email")) {
      results.email = await deliverEmail({
        to: toEmail,
        subject: body.subject || content.subject,
        text: content.text,
        html: content.html,
      });
      await logDelivery({
        channel: "email",
        kind,
        status: results.email.ok ? "sent" : "failed",
        saleId: body.saleId,
        quotationId: body.quotation?.id,
        receiptNo: content.receiptNo,
        to: toEmail,
        providerId: results.email.id,
        error: results.email.error,
        preview: content.text,
      });
    }

    if (channels.includes("whatsapp")) {
      results.whatsapp = deliverWhatsApp(toPhone, content.text);
      await logDelivery({
        channel: "whatsapp",
        kind,
        // The operator still confirms the send inside WhatsApp, so this is a hand-off.
        status: results.whatsapp.ok ? "handoff" : "failed",
        saleId: body.saleId,
        quotationId: body.quotation?.id,
        receiptNo: content.receiptNo,
        to: toPhone,
        error: results.whatsapp.error,
        preview: content.text,
      });
    }

    if (channels.includes("sms")) {
      results.sms = await deliverSms(toPhone, content.sms);
      await logDelivery({
        channel: "sms",
        kind,
        status: results.sms.ok ? "sent" : "failed",
        saleId: body.saleId,
        quotationId: body.quotation?.id,
        receiptNo: content.receiptNo,
        to: toPhone,
        providerId: results.sms.id,
        error: results.sms.error,
        preview: content.sms,
      });
    }

    const failed = channels.filter((channel) => !results[channel]?.ok);
    if (failed.length > 0) {
      const parts = channels.map((channel) => {
        const result = results[channel];
        return result?.ok
          ? `${channel.toUpperCase()} OK${result.to ? ` → ${result.to}` : ""}`
          : `${channel.toUpperCase()} FAILED: ${result?.error || "unknown error"}`;
      });
      return NextResponse.json(
        {
          ok: false,
          error: parts.join(" · "),
          receiptNo: content.receiptNo,
          ...results,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      receiptNo: content.receiptNo,
      ...results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send notification",
      },
      { status: 400 },
    );
  }
}

async function buildContent(input: {
  body: Body;
  kind: DeliveryKind;
  toPhone: string;
  toEmail: string;
  customerName: string;
}): Promise<{
  subject: string;
  text: string;
  sms: string;
  html?: string;
  receiptNo?: string;
}> {
  const { body, kind, toPhone, toEmail, customerName } = input;
  const override = body.message?.trim();

  if (kind === "receipt") {
    const settings = await loadReceiptSettings();
    const doc = body.saleId
      ? await receiptDocForSale(body.saleId, { settings })
      : buildReceiptDoc({
          draft: true,
          customer: { name: customerName, phone: toPhone, email: toEmail },
          salesperson: body.salesperson,
          payment: body.payment,
          lines: body.lines ?? [],
          total: body.total,
          settings,
        });

    if (!doc) {
      throw new Error("Sale not found for this receipt");
    }

    return {
      subject: `${doc.store.name} Receipt ${doc.receiptNo}`,
      text: override || receiptText(doc),
      sms: receiptSmsText(doc),
      html: override ? undefined : renderReceiptHtml(doc, "a4"),
      receiptNo: doc.receiptNo,
    };
  }

  if (kind === "quotation" && body.quotation) {
    const quotation = {
      number: body.quotation.number,
      customerName: customerName || "Customer",
      total: Number(body.total || 0),
      items: body.quotation.items,
      date: body.quotation.date,
      expiry: body.quotation.expiry,
    };
    return {
      subject: `UNICH Quotation ${body.quotation.number}`.trim(),
      text: override || formatQuotationMessage(quotation),
      sms: formatQuotationSms(quotation),
    };
  }

  if (!override) {
    throw new Error("Message is required");
  }
  return { subject: "UNICH Message", text: override, sms: override.slice(0, 300) };
}

async function deliverEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<ChannelResult> {
  if (!input.to) {
    return {
      ok: false,
      error: "No customer email on file — add it on POS or in the CRM",
    };
  }
  const sent = await sendEmail(input);
  return sent.ok
    ? { ok: true, id: sent.id, to: input.to }
    : { ok: false, error: sent.error, to: input.to };
}

function deliverWhatsApp(toPhone: string, message: string): ChannelResult {
  if (!toPhone) {
    return { ok: false, error: "Customer phone is required" };
  }
  try {
    return { ok: true, url: buildWhatsAppUrl(toPhone, message), to: toPhone };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "WhatsApp failed",
    };
  }
}

async function deliverSms(toPhone: string, text: string): Promise<ChannelResult> {
  if (!toPhone) {
    return { ok: false, error: "Customer phone is required" };
  }
  const sent = await sendSms({ to: toPhone, text });
  return sent.ok
    ? { ok: true, id: sent.id, to: toPhone }
    : { ok: false, error: sent.error, to: toPhone };
}

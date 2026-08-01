import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DeliveryLog, Sale } from "@/lib/models";
import { logDelivery } from "@/lib/notifications/log";
import { receiptNumberFor } from "@/lib/receipt/document";
import { toJSONList } from "@/lib/serialize";
import type { DeliveryChannel, DeliveryStatus } from "@/lib/types";

const CHANNELS: DeliveryChannel[] = ["print", "email", "whatsapp", "sms"];
const STATUSES: DeliveryStatus[] = ["sent", "failed", "handoff", "printed"];

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const saleId = searchParams.get("saleId");
    const channel = searchParams.get("channel");
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

    const filter: Record<string, unknown> = {};
    if (saleId) filter.saleId = saleId;
    if (channel && CHANNELS.includes(channel as DeliveryChannel)) {
      filter.channel = channel;
    }

    const entries = await DeliveryLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit);
    return NextResponse.json(toJSONList(entries));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load delivery log",
      },
      { status: 500 },
    );
  }
}

/** Records browser-side deliveries (print jobs, opened WhatsApp hand-offs). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const channel = String(body.channel || "") as DeliveryChannel;
    const status = String(body.status || "sent") as DeliveryStatus;

    if (!CHANNELS.includes(channel)) {
      return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
    }
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }

    const saleId = body.saleId ? String(body.saleId) : undefined;
    const receiptNo = body.receiptNo
      ? String(body.receiptNo)
      : await receiptNumberForSale(saleId);

    await logDelivery({
      channel,
      status,
      kind: body.kind === "quotation" ? "quotation" : "receipt",
      saleId,
      receiptNo,
      format: body.format ? String(body.format) : undefined,
      to: body.to ? String(body.to) : undefined,
      error: body.error ? String(body.error) : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to record delivery",
      },
      { status: 400 },
    );
  }
}

async function receiptNumberForSale(saleId?: string): Promise<string> {
  if (!saleId) return "";
  await connectDB();
  const sale = await Sale.findById(saleId).select("createdAt").lean<{
    createdAt?: Date;
  }>();
  if (!sale) return "";
  return receiptNumberFor(saleId, new Date(sale.createdAt ?? Date.now()));
}

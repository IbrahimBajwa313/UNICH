import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PurchaseOrder } from "@/lib/models";
import {
  applyFifoFromPurchase,
  derivePurchaseStatus,
  syncReceivedQtys,
} from "@/lib/purchases/applyFifoFromPurchase";
import { toJSON, toJSONList } from "@/lib/serialize";

function mapLine(l: Record<string, unknown>) {
  return {
    ...l,
    id: String(l.id ?? l._id ?? ""),
    productId: String(l.productId),
  };
}

function mapPO(p: Record<string, unknown>) {
  const lines = Array.isArray(p.lines) ? p.lines.map((l) => mapLine(l as Record<string, unknown>)) : [];
  return {
    ...p,
    supplierId: String(p.supplierId),
    date: p.date ? new Date(p.date as string).toISOString().slice(0, 10) : null,
    lines,
  };
}

type LineBody = {
  productId: string;
  productName?: string;
  sku?: string;
  qtyOrdered?: number;
  qty?: number;
  qtyReceived?: number;
  unitCost?: number;
};

function normalizeLines(raw: LineBody[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => {
      const qtyOrdered = Number(l.qtyOrdered ?? l.qty ?? 0);
      return {
        productId: String(l.productId),
        productName: String(l.productName || "").trim() || "Product",
        sku: String(l.sku || ""),
        qtyOrdered,
        qtyReceived: Number(l.qtyReceived ?? 0),
        qtyFifoApplied: 0,
        unitCost: Number(l.unitCost ?? 0),
      };
    })
    .filter((l) => l.productId && l.qtyOrdered > 0);
}

export async function GET() {
  try {
    await connectDB();
    const purchases = await PurchaseOrder.find().sort({ date: -1 });
    return NextResponse.json(toJSONList(purchases).map(mapPO));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load purchases" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const lines = normalizeLines(body.lines);
    let status = (body.status as string) || "draft";

    syncReceivedQtys(lines, status);
    if (lines.length) {
      status = derivePurchaseStatus(lines, status as "draft" | "ordered" | "received" | "partial");
    }

    const total =
      lines.length > 0
        ? lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0)
        : Number(body.total || 0);
    const itemCount = lines.length > 0 ? lines.length : Number(body.itemCount || 0);

    const purchase = await PurchaseOrder.create({
      supplierId: body.supplierId,
      supplierName: body.supplierName,
      currency: body.currency || "AED",
      notes: body.notes,
      date: new Date(body.date || Date.now()),
      status,
      total,
      itemCount,
      lines,
    });

    // Goods receipt → FIFO layers + costFifo refresh (via addFifoLayer)
    if (status === "received" || status === "partial") {
      await applyFifoFromPurchase(purchase);
      purchase.markModified("lines");
      await purchase.save();
    }

    return NextResponse.json(mapPO(toJSON(purchase)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create purchase" },
      { status: 400 },
    );
  }
}

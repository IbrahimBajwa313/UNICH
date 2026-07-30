import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PurchaseOrder } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

function mapPO(p: Record<string, unknown>) {
  return {
    ...p,
    supplierId: String(p.supplierId),
    date: p.date ? new Date(p.date as string).toISOString().slice(0, 10) : null,
  };
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
    const purchase = await PurchaseOrder.create({
      ...body,
      date: new Date(body.date || Date.now()),
    });
    return NextResponse.json(mapPO(toJSON(purchase)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create purchase" },
      { status: 400 },
    );
  }
}

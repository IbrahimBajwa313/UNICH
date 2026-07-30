import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PurchaseOrder } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.date) body.date = new Date(body.date);
    const purchase = await PurchaseOrder.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }
    return NextResponse.json(toJSON(purchase));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update purchase" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const purchase = await PurchaseOrder.findByIdAndDelete(id);
    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete purchase" },
      { status: 500 },
    );
  }
}

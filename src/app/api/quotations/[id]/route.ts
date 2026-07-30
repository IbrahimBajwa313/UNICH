import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Quotation, Sale } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.date) body.date = new Date(body.date);
    if (body.expiry) body.expiry = new Date(body.expiry);
    const quotation = await Quotation.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }
    return NextResponse.json(toJSON(quotation));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update quotation" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const quotation = await Quotation.findByIdAndDelete(id);
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete quotation" },
      { status: 500 },
    );
  }
}

/** Convert approved quotation into a sale record (no stock deduct until POS checkout path). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = body.action || "convert";
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    if (action === "convert") {
      if (quotation.status !== "approved") {
        return NextResponse.json(
          { error: "Only approved quotations can be converted" },
          { status: 400 },
        );
      }
      if (quotation.convertedToSaleId) {
        return NextResponse.json(
          { error: "Quotation already converted" },
          { status: 400 },
        );
      }
      const sale = await Sale.create({
        customerPhone: quotation.customerPhone,
        customerName: quotation.customerName,
        payment: "credit",
        status: "completed",
        saleType: "Wholesale",
        subtotal: quotation.total,
        total: quotation.total,
        lines: [
          {
            name: `Converted ${quotation.number}`,
            qty: quotation.items,
            unitLabel: "items",
            unitPrice: quotation.total / Math.max(quotation.items, 1),
            lineType: "wholesale",
          },
        ],
      });
      quotation.convertedToSaleId = sale._id;
      await quotation.save();
      return NextResponse.json({
        quotation: toJSON(quotation),
        sale: toJSON(sale),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process quotation" },
      { status: 500 },
    );
  }
}

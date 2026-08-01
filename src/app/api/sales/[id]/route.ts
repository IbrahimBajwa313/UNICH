import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Sale } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

type RouteContext = { params: Promise<{ id: string }> };

function mapSale(s: Record<string, unknown>) {
  const createdAt = s.createdAt ? new Date(s.createdAt as string) : new Date();
  return {
    ...s,
    time: createdAt.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    customer: s.customerName,
    type: s.saleType,
    payment:
      typeof s.payment === "string"
        ? s.payment.charAt(0).toUpperCase() + s.payment.slice(1)
        : s.payment,
  };
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { id } = await context.params;
    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }
    return NextResponse.json(mapSale(toJSON(sale)!));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load sale" },
      { status: 500 },
    );
  }
}

/**
 * Void a held bill (discard) or update status.
 * Completing a held bill is done by resuming into the cart then POST /api/sales.
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { id } = await context.params;
    const body = await req.json();
    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    if (body.status === "void") {
      if (sale.status !== "held") {
        return NextResponse.json(
          { error: "Only held bills can be discarded" },
          { status: 400 },
        );
      }
      sale.status = "void";
      await sale.save();
      return NextResponse.json(mapSale(toJSON(sale)!));
    }

    return NextResponse.json(
      { error: "Unsupported status update" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update sale",
      },
      { status: 400 },
    );
  }
}

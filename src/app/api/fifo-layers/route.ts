import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { FifoLayer } from "@/lib/models";
import { addFifoLayer } from "@/lib/inventory";
import { toJSON, toJSONList } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";

export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const filter = productId ? { productId } : {};
    const layers = await FifoLayer.find(filter).sort({ purchaseDate: 1 });
    return NextResponse.json(
      toJSONList(layers).map((l) => ({
        ...l,
        productId: String(l.productId),
        supplierId: String(l.supplierId),
        productionOrderId: l.productionOrderId
          ? String(l.productionOrderId)
          : undefined,
        source: (l.source as string) || "purchase",
        purchaseDate:
          l.purchaseDate instanceof Date
            ? l.purchaseDate.toISOString().slice(0, 10)
            : String(l.purchaseDate).slice(0, 10),
      })),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load FIFO layers" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const body = await req.json();
    const layer = await addFifoLayer({
      productId: body.productId,
      supplierId: body.supplierId,
      supplierName: body.supplierName,
      purchaseDate: new Date(body.purchaseDate),
      qty: Number(body.qtyRemaining ?? body.qty),
      unitCost: Number(body.unitCost),
      currency: body.currency || "AED",
    });
    return NextResponse.json(toJSON(layer), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create FIFO layer" },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PurchaseOrder } from "@/lib/models";
import {
  applyFifoFromPurchase,
  derivePurchaseStatus,
  syncReceivedQtys,
} from "@/lib/purchases/applyFifoFromPurchase";
import { toJSON } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";

type Ctx = { params: Promise<{ id: string }> };

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
  qtyFifoApplied?: number;
};

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();

    const purchase = await PurchaseOrder.findById(id);
    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    if (body.date) purchase.date = new Date(body.date);
    if (body.supplierId) purchase.supplierId = body.supplierId;
    if (body.supplierName) purchase.supplierName = body.supplierName;
    if (body.currency) purchase.currency = body.currency;
    if (body.notes !== undefined) purchase.notes = body.notes;

    // Full line replace (preserves qtyFifoApplied when productId+unitCost match by index productId)
    if (Array.isArray(body.lines)) {
      const prevByProduct = new Map(
        purchase.lines.map((l) => [String(l.productId), Number(l.qtyFifoApplied) || 0]),
      );
      purchase.lines = body.lines
        .map((l: LineBody) => {
          const qtyOrdered = Number(l.qtyOrdered ?? l.qty ?? 0);
          const productId = String(l.productId);
          return {
            productId,
            productName: String(l.productName || "").trim() || "Product",
            sku: String(l.sku || ""),
            qtyOrdered,
            qtyReceived: Number(l.qtyReceived ?? 0),
            qtyFifoApplied:
              l.qtyFifoApplied !== undefined
                ? Number(l.qtyFifoApplied)
                : prevByProduct.get(productId) ?? 0,
            unitCost: Number(l.unitCost ?? 0),
          };
        })
        .filter((l) => l.productId && l.qtyOrdered > 0);
      purchase.itemCount = purchase.lines.length;
      purchase.total = purchase.lines.reduce(
        (s, l) => s + l.qtyOrdered * l.unitCost,
        0,
      );
    } else {
      if (body.total !== undefined) purchase.total = Number(body.total);
      if (body.itemCount !== undefined) purchase.itemCount = Number(body.itemCount);
    }

    // Convenience: receiveAll marks every line fully received
    if (body.receiveAll === true && purchase.lines.length) {
      for (const line of purchase.lines) {
        line.qtyReceived = line.qtyOrdered;
      }
      body.status = "received";
    }

    // Per-line receive deltas: { receive: [{ productId, qty }] } adds to qtyReceived
    if (Array.isArray(body.receive) && purchase.lines.length) {
      for (const r of body.receive as Array<{ productId: string; qty: number }>) {
        const line = purchase.lines.find((l) => String(l.productId) === String(r.productId));
        if (!line) continue;
        line.qtyReceived = Math.min(
          line.qtyOrdered,
          (Number(line.qtyReceived) || 0) + Math.max(0, Number(r.qty) || 0),
        );
      }
    }

    let status = (body.status as string) || purchase.status;
    syncReceivedQtys(purchase.lines, status);
    if (purchase.lines.length) {
      status = derivePurchaseStatus(
        purchase.lines,
        status as "draft" | "ordered" | "received" | "partial",
      );
    }
    purchase.status = status as typeof purchase.status;

    // Apply FIFO for any newly received qty
    if (purchase.lines.length && (status === "received" || status === "partial")) {
      await applyFifoFromPurchase(purchase);
      purchase.markModified("lines");
    }

    await purchase.save();
    return NextResponse.json(mapPO(toJSON(purchase)!));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update purchase" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

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

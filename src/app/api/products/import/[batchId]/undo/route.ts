import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { FifoLayer, ImportBatch, Product } from "@/lib/models";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ batchId: string }> };

export async function POST(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { batchId } = await ctx.params;

    const latest = await ImportBatch.findOne({ status: "committed" }).sort({
      createdAt: -1,
    });
    if (!latest || latest.batchId !== batchId) {
      return NextResponse.json(
        { error: "Only the most recent committed import can be undone" },
        { status: 400 },
      );
    }

    let deleted = 0;
    let restored = 0;

    for (const row of latest.rows) {
      if (row.action === "create" && row.createdProductId) {
        await FifoLayer.deleteMany({ productId: row.createdProductId });
        await Product.findByIdAndDelete(row.createdProductId);
        deleted += 1;
      } else if (row.action === "update" && row.previousProductSnapshot) {
        const snap = row.previousProductSnapshot as {
          sku: string;
          name: string;
          category: string;
          unit: "ml" | "pcs";
          minMarginPct: number;
          costFifo: number;
          sellPrice: number;
          wholesalePrice?: number;
          brand?: string;
          concentration?: string;
          gender?: string;
          size?: string;
          collection?: string;
          notes?: string;
          itemType?: "finished" | "packaging" | "raw";
        };
        const product = await Product.findOne({ sku: snap.sku });
        if (!product) continue;
        product.name = snap.name;
        product.category = snap.category;
        product.unit = snap.unit;
        product.minMarginPct = snap.minMarginPct;
        product.costFifo = snap.costFifo;
        product.sellPrice = snap.sellPrice;
        product.wholesalePrice = snap.wholesalePrice ?? 0;
        product.brand = snap.brand || "";
        product.concentration = snap.concentration || "";
        product.gender = snap.gender || "";
        product.size = snap.size || "";
        product.collection = snap.collection || "";
        product.notes = snap.notes || "";
        product.itemType = snap.itemType || "finished";
        product.importBatchId = null;
        await product.save();
        restored += 1;
      }
    }

    await Product.updateMany({ importBatchId: batchId }, { $set: { importBatchId: null } });
    latest.status = "undone";
    await latest.save();

    return NextResponse.json({
      batchId,
      status: "undone",
      deleted,
      restored,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to undo import" },
      { status: 500 },
    );
  }
}

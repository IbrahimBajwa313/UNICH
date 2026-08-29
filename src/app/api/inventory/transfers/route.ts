import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { warnIfNegativeStock } from "@/lib/inventory/stockCheck";
import { Product } from "@/lib/models";
import { toJSON } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";

const BUCKETS = [
  "stockSellable",
  "stockTester",
  "stockSample",
  "stockPersonal",
] as const;

type Bucket = (typeof BUCKETS)[number];

function isBucket(v: string): v is Bucket {
  return (BUCKETS as readonly string[]).includes(v);
}

/**
 * INV-06 / TRF: move qty between in-store stock buckets
 * (sellable ↔ tester ↔ sample ↔ personal).
 * Warns when source would go negative; blocks unless acknowledgeWarning.
 * Multi-branch transfers can reuse the same warning contract later.
 */
export async function POST(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const body = await req.json();
    const productId = String(body.productId || "");
    const qty = Number(body.qty);
    const from = String(body.from || "");
    const to = String(body.to || "");
    const acknowledgeWarning = Boolean(body.acknowledgeWarning);

    if (!mongoose.isValidObjectId(productId)) {
      return NextResponse.json({ error: "Valid productId required" }, { status: 400 });
    }
    if (!(qty > 0) || !Number.isFinite(qty)) {
      return NextResponse.json({ error: "qty must be > 0" }, { status: 400 });
    }
    if (!isBucket(from) || !isBucket(to) || from === to) {
      return NextResponse.json(
        {
          error:
            "from/to must be different buckets: stockSellable, stockTester, stockSample, stockPersonal",
        },
        { status: 400 },
      );
    }

    const product = await Product.findById(productId);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const fromQty = Number(product.get(from)) || 0;
    const projectedFrom = fromQty - qty;
    const warnings: string[] = [];

    if (projectedFrom < 0) {
      const w = warnIfNegativeStock(
        `${product.name} (${from})`,
        projectedFrom,
      );
      if (w) warnings.push(w);
    } else if (fromQty < qty) {
      warnings.push(
        `Stock warning: ${product.name} ${from} has ${fromQty}, transfer needs ${qty}. Admin should restock or reorder.`,
      );
    }

    if (warnings.length > 0 && !acknowledgeWarning) {
      return NextResponse.json(
        {
          error: warnings[0],
          code: "STOCK_WARNING",
          warnings,
          requiresAck: true,
        },
        { status: 409 },
      );
    }

    // Hard-block negative bucket transfers — INV-06 warns; do not invent stock
    if (fromQty < qty) {
      return NextResponse.json(
        {
          error: `Insufficient ${from} for ${product.name} (need ${qty}, have ${fromQty})`,
          code: "INSUFFICIENT_STOCK",
          warnings: [
            `Stock warning: Insufficient ${from} for ${product.name}. Admin should restock or reorder.`,
            ...warnings,
          ],
        },
        { status: 400 },
      );
    }

    product.set(from, fromQty - qty);
    product.set(to, (Number(product.get(to)) || 0) + qty);
    await product.save();

    return NextResponse.json({
      ok: true,
      from,
      to,
      qty,
      warnings,
      product: toJSON(product),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          safeErrorMessage(error, "Failed to transfer stock"),
      },
      { status: 400 },
    );
  }
}

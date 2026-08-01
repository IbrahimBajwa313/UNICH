import mongoose from "mongoose";
import { FifoLayer, Product } from "@/lib/models";
import { SaleError } from "@/lib/sales/errors";

export type FifoDeductionBatch = {
  layerId: string;
  qty: number;
  unitCost: number;
  purchaseDate: Date;
};

export type DeductFifoResult = {
  costTotal: number;
  batches: FifoDeductionBatch[];
};

type SessionOpt = {
  session?: mongoose.ClientSession | null;
  /** Skip weighted costFifo refresh (do it after the sale commits). */
  skipCostUpdate?: boolean;
};

/**
 * FIFO consume oldest layers first.
 * Reserves sellable stock atomically, then consumes layers in one fetch + bulkWrite
 * (instead of findOne/update per layer round-trip — critical on remote Atlas).
 */
export async function deductFifo(
  productId: string | mongoose.Types.ObjectId,
  qty: number,
  opts: SessionOpt = {},
): Promise<DeductFifoResult> {
  if (qty <= 0) return { costTotal: 0, batches: [] };

  const session = opts.session ?? null;
  const findOpts = session ? { session } : {};
  const bulkOpts = session ? { session, ordered: true as const } : { ordered: true as const };

  // Atomic reserve on sellable stock to reduce race windows
  const reserved = await Product.findOneAndUpdate(
    { _id: productId, stockSellable: { $gte: qty } },
    { $inc: { stockSellable: -qty }, $set: { lastSoldAt: new Date() } },
    { returnDocument: "after", ...findOpts },
  );

  if (!reserved) {
    const product = await Product.findById(productId, null, findOpts);
    if (!product) {
      throw new SaleError("PRODUCT_NOT_FOUND", "Product not found");
    }
    throw new SaleError(
      "INSUFFICIENT_STOCK",
      `Insufficient stock for ${product.name}`,
    );
  }

  let remaining = qty;
  let costTotal = 0;
  const batches: FifoDeductionBatch[] = [];

  try {
    const layers = await FifoLayer.find(
      { productId, qtyRemaining: { $gt: 0 } },
      null,
      { sort: { purchaseDate: 1 }, ...findOpts },
    );

    const ops: Array<{
      updateOne: {
        filter: { _id: mongoose.Types.ObjectId; qtyRemaining: { $gte: number } };
        update: { $inc: { qtyRemaining: number } };
      };
    }> = [];

    for (const layer of layers) {
      if (remaining <= 0) break;
      const take = Math.min(layer.qtyRemaining, remaining);
      if (take <= 0) continue;

      ops.push({
        updateOne: {
          filter: { _id: layer._id, qtyRemaining: { $gte: take } },
          update: { $inc: { qtyRemaining: -take } },
        },
      });
      batches.push({
        layerId: String(layer._id),
        qty: take,
        unitCost: layer.unitCost,
        purchaseDate: layer.purchaseDate,
      });
      remaining -= take;
      costTotal += take * layer.unitCost;
    }

    if (remaining > 0) {
      throw new SaleError(
        "INSUFFICIENT_STOCK",
        `Insufficient FIFO stock for ${reserved.name}`,
      );
    }

    if (ops.length > 0) {
      const result = await FifoLayer.bulkWrite(ops, bulkOpts);
      // Outside a transaction, concurrent consumers can steal layers.
      if (!session && result.modifiedCount < ops.length) {
        throw new SaleError(
          "INSUFFICIENT_STOCK",
          `Insufficient FIFO stock for ${reserved.name}`,
        );
      }
    }

    if (!opts.skipCostUpdate) {
      await refreshCostFifo(productId, { session });
    }
  } catch (err) {
    // Compensating restore of sellable if layer phase fails outside a transaction
    if (!session) {
      await Product.findByIdAndUpdate(productId, {
        $inc: { stockSellable: qty },
      });
      for (const b of batches) {
        await FifoLayer.findByIdAndUpdate(b.layerId, {
          $inc: { qtyRemaining: b.qty },
        });
      }
    }
    throw err;
  }

  return { costTotal, batches };
}

/** Recalculate weighted FIFO cost for one or more products (1 aggregation query). */
export async function refreshCostFifo(
  productIds: string | mongoose.Types.ObjectId | Array<string | mongoose.Types.ObjectId>,
  opts: SessionOpt = {},
) {
  const ids = (Array.isArray(productIds) ? productIds : [productIds])
    .map((id) =>
      typeof id === "string" ? new mongoose.Types.ObjectId(id) : id,
    )
    .filter(Boolean);
  if (ids.length === 0) return;

  const session = opts.session ?? null;
  const agg = FifoLayer.aggregate([
    { $match: { productId: { $in: ids }, qtyRemaining: { $gt: 0 } } },
    {
      $group: {
        _id: "$productId",
        totalQty: { $sum: "$qtyRemaining" },
        totalCost: { $sum: { $multiply: ["$qtyRemaining", "$unitCost"] } },
      },
    },
  ]);
  if (session) agg.session(session);
  const rows = await agg;

  const byId = new Map(
    rows.map((r) => [
      String(r._id),
      r.totalQty > 0 ? Number((r.totalCost / r.totalQty).toFixed(3)) : 0,
    ]),
  );

  const updates = ids.map((id) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { costFifo: byId.get(String(id)) ?? 0 } },
    },
  }));

  if (updates.length === 1 && session) {
    await Product.findByIdAndUpdate(
      ids[0],
      { $set: { costFifo: byId.get(String(ids[0])) ?? 0 } },
      session ? { session } : {},
    );
    return;
  }

  await Product.bulkWrite(updates, session ? { session } : {});
}

/** Reverse a prior deductFifo result (compensating rollback). */
export async function restoreFifo(
  productId: string | mongoose.Types.ObjectId,
  result: DeductFifoResult,
  opts: SessionOpt = {},
) {
  if (result.batches.length === 0) return;
  const session = opts.session ?? null;
  const findOpts = session ? { session } : {};

  let totalQty = 0;
  const ops = result.batches.map((b) => {
    totalQty += b.qty;
    return {
      updateOne: {
        filter: { _id: b.layerId },
        update: { $inc: { qtyRemaining: b.qty } },
      },
    };
  });

  if (ops.length > 0) {
    await FifoLayer.bulkWrite(ops, session ? { session, ordered: false } : { ordered: false });
  }

  await Product.findByIdAndUpdate(
    productId,
    { $inc: { stockSellable: totalQty } },
    findOpts,
  );

  if (!opts.skipCostUpdate) {
    await refreshCostFifo(productId, { session });
  }
}

export async function addFifoLayer(input: {
  productId: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: Date;
  qty: number;
  unitCost: number;
  currency: string;
}) {
  const layer = await FifoLayer.create({
    productId: input.productId,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    purchaseDate: input.purchaseDate,
    qtyRemaining: input.qty,
    unitCost: input.unitCost,
    currency: input.currency,
  });

  const product = await Product.findById(input.productId);
  if (product) {
    product.stockSellable += input.qty;
    await product.save();
    await refreshCostFifo(input.productId);
  }

  return layer;
}

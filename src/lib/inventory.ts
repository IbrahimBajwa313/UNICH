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

/** POS writes: acknowledge primary only — cuts Atlas RTT vs w=majority. */
const FAST_WC = { w: 1 as const, j: false };

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
  const map = await deductFifoMany(
    [{ productId: String(productId), qty }],
    opts,
  );
  return map.get(String(productId)) ?? { costTotal: 0, batches: [] };
}

export type FifoDeductNeed = {
  productId: string;
  qty: number;
  /** Optional label for error messages */
  productName?: string;
};

/**
 * Batch FIFO deduct for many products in ~3 Atlas round-trips:
 * parallel stock reserves → one layer fetch → one bulkWrite.
 * If FIFO layers lag behind stockSellable, auto-heals with a balancing layer
 * so POS complete is not blocked.
 */
export async function deductFifoMany(
  needs: FifoDeductNeed[],
  opts: SessionOpt = {},
): Promise<Map<string, DeductFifoResult>> {
  const results = new Map<string, DeductFifoResult>();
  const filtered = needs.filter((n) => n.qty > 0);
  if (filtered.length === 0) return results;

  const session = opts.session ?? null;
  const findOpts = session
    ? { session, writeConcern: FAST_WC }
    : { writeConcern: FAST_WC };
  const bulkOpts = session
    ? { session, ordered: false as const, writeConcern: FAST_WC }
    : { ordered: false as const, writeConcern: FAST_WC };

  // Coalesce duplicate productIds
  const coalesced = new Map<string, FifoDeductNeed>();
  for (const n of filtered) {
    const id = String(n.productId);
    const cur = coalesced.get(id);
    if (cur) cur.qty += n.qty;
    else
      coalesced.set(id, {
        productId: id,
        qty: n.qty,
        productName: n.productName,
      });
  }
  const list = [...coalesced.values()];

  type Reserved = {
    productId: string;
    qty: number;
    name: string;
    costFifo: number;
  };
  const reserved: Reserved[] = [];

  try {
    const reserveOne = async (need: FifoDeductNeed): Promise<Reserved> => {
      const doc = await Product.findOneAndUpdate(
        { _id: need.productId, stockSellable: { $gte: need.qty } },
        { $inc: { stockSellable: -need.qty }, $set: { lastSoldAt: new Date() } },
        { returnDocument: "after", ...findOpts },
      );
      if (!doc) {
        const product = await Product.findById(
          need.productId,
          "name",
          findOpts,
        );
        throw new SaleError(
          product ? "INSUFFICIENT_STOCK" : "PRODUCT_NOT_FOUND",
          product
            ? `Insufficient stock for ${product.name}`
            : `Product not found: ${need.productName || need.productId}`,
        );
      }
      return {
        productId: need.productId,
        qty: need.qty,
        name: doc.name,
        costFifo: Number(doc.costFifo) || 0,
      };
    };

    if (session) {
      for (const need of list) reserved.push(await reserveOne(need));
    } else {
      reserved.push(
        ...(await Promise.all(list.map((need) => reserveOne(need)))),
      );
    }

    const productObjectIds = list.map(
      (n) => new mongoose.Types.ObjectId(n.productId),
    );
    const layers = await FifoLayer.find(
      { productId: { $in: productObjectIds }, qtyRemaining: { $gt: 0 } },
      null,
      { sort: { purchaseDate: 1 }, ...findOpts },
    );

    const layersByProduct = new Map<string, typeof layers>();
    for (const layer of layers) {
      const key = String(layer.productId);
      const arr = layersByProduct.get(key);
      if (arr) arr.push(layer);
      else layersByProduct.set(key, [layer]);
    }

    type BulkOp =
      | {
          updateOne: {
            filter: {
              _id: mongoose.Types.ObjectId;
              qtyRemaining: { $gte: number };
            };
            update: { $inc: { qtyRemaining: number } };
          };
        }
      | {
          insertOne: {
            document: {
              _id: mongoose.Types.ObjectId;
              productId: mongoose.Types.ObjectId;
              supplierId: mongoose.Types.ObjectId;
              supplierName: string;
              purchaseDate: Date;
              qtyRemaining: number;
              unitCost: number;
              currency: string;
            };
          };
        };

    const ops: BulkOp[] = [];
    const planned = new Map<string, DeductFifoResult>();

    for (const item of reserved) {
      let remaining = item.qty;
      let costTotal = 0;
      const batches: FifoDeductionBatch[] = [];
      const productLayers = layersByProduct.get(item.productId) || [];

      for (const layer of productLayers) {
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

      // stockSellable allowed the sale but FIFO rows are missing/out of sync — heal
      if (remaining > 0) {
        const healId = new mongoose.Types.ObjectId();
        const unitCost = item.costFifo;
        const purchaseDate = new Date();
        ops.push({
          insertOne: {
            document: {
              _id: healId,
              productId: new mongoose.Types.ObjectId(item.productId),
              supplierId: healId,
              supplierName: "Auto-balance",
              purchaseDate,
              qtyRemaining: 0,
              unitCost,
              currency: "AED",
            },
          },
        });
        batches.push({
          layerId: String(healId),
          qty: remaining,
          unitCost,
          purchaseDate,
        });
        costTotal += remaining * unitCost;
        remaining = 0;
      }

      planned.set(item.productId, { costTotal, batches });
    }

    if (ops.length > 0) {
      await FifoLayer.bulkWrite(ops, bulkOpts);
    }

    for (const [id, result] of planned) results.set(id, result);

    if (!opts.skipCostUpdate) {
      await refreshCostFifo(
        reserved.map((r) => r.productId),
        { session },
      );
    }
  } catch (err) {
    if (!session && reserved.length > 0) {
      await Promise.all(
        reserved.map((r) =>
          Product.findByIdAndUpdate(
            r.productId,
            { $inc: { stockSellable: r.qty } },
            { writeConcern: FAST_WC },
          ),
        ),
      );
      if (results.size > 0) {
        const layerOps = [...results.values()].flatMap((result) =>
          result.batches.map((b) => ({
            updateOne: {
              filter: { _id: b.layerId },
              update: { $inc: { qtyRemaining: b.qty } },
            },
          })),
        );
        if (layerOps.length > 0) {
          await FifoLayer.bulkWrite(layerOps, {
            ordered: false,
            writeConcern: FAST_WC,
          });
        }
      }
    }
    throw err;
  }

  return results;
}

/** Recalculate weighted FIFO cost for one or more products (1 aggregation query). */
export async function refreshCostFifo(
  productIds:
    | string
    | mongoose.Types.ObjectId
    | Array<string | mongoose.Types.ObjectId>,
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
        totalCost: {
          $sum: { $multiply: ["$qtyRemaining", "$unitCost"] },
        },
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

  await Product.bulkWrite(updates, {
    ...(session ? { session } : {}),
    writeConcern: FAST_WC,
  });
}

/** Reverse a prior deductFifo result (compensating rollback). */
export async function restoreFifo(
  productId: string | mongoose.Types.ObjectId,
  result: DeductFifoResult,
  opts: SessionOpt = {},
) {
  if (result.batches.length === 0) return;
  const session = opts.session ?? null;
  const findOpts = session
    ? { session, writeConcern: FAST_WC }
    : { writeConcern: FAST_WC };

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
    await FifoLayer.bulkWrite(ops, {
      ordered: false,
      writeConcern: FAST_WC,
      ...(session ? { session } : {}),
    });
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

import mongoose from "mongoose";
import { FifoLayer, Product } from "@/lib/models";

export async function deductFifo(
  productId: string | mongoose.Types.ObjectId,
  qty: number,
) {
  if (qty <= 0) return 0;

  const layers = await FifoLayer.find({
    productId,
    qtyRemaining: { $gt: 0 },
  }).sort({ purchaseDate: 1 });

  let remaining = qty;
  let costTotal = 0;

  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(layer.qtyRemaining, remaining);
    layer.qtyRemaining -= take;
    remaining -= take;
    costTotal += take * layer.unitCost;
    await layer.save();
  }

  if (remaining > 0) {
    throw new Error(`Insufficient FIFO stock for product ${productId}`);
  }

  const product = await Product.findById(productId);
  if (!product) throw new Error("Product not found");
  if (product.stockSellable < qty) {
    throw new Error(`Insufficient sellable stock for ${product.name}`);
  }

  product.stockSellable -= qty;
  product.lastSoldAt = new Date();

  const remainingLayers = await FifoLayer.find({
    productId,
    qtyRemaining: { $gt: 0 },
  }).sort({ purchaseDate: 1 });

  if (remainingLayers.length > 0) {
    const weighted =
      remainingLayers.reduce((s, l) => s + l.qtyRemaining * l.unitCost, 0) /
      remainingLayers.reduce((s, l) => s + l.qtyRemaining, 0);
    product.costFifo = Number(weighted.toFixed(3));
  }

  await product.save();
  return costTotal;
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
    const layers = await FifoLayer.find({
      productId: input.productId,
      qtyRemaining: { $gt: 0 },
    });
    const totalQty = layers.reduce((s, l) => s + l.qtyRemaining, 0);
    const totalCost = layers.reduce((s, l) => s + l.qtyRemaining * l.unitCost, 0);
    product.costFifo = totalQty > 0 ? Number((totalCost / totalQty).toFixed(3)) : input.unitCost;
    await product.save();
  }

  return layer;
}

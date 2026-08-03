import { randomUUID } from "crypto";
import mongoose from "mongoose";
import {
  addProductionFifoLayer,
  deductFifoMany,
  restoreFifo,
  type DeductFifoResult,
} from "@/lib/inventory";
import { Product, ProductionOrder, Supplier } from "@/lib/models";
import { planProduction } from "@/lib/production/planProduction";
import { SaleError } from "@/lib/sales/errors";

const PRODUCTION_SUPPLIER_NAME = "In-house Production";

export async function ensureProductionSupplier() {
  let supplier = await Supplier.findOne({ name: PRODUCTION_SUPPLIER_NAME });
  if (!supplier) {
    supplier = await Supplier.create({
      name: PRODUCTION_SUPPLIER_NAME,
      phone: "internal",
      currency: "AED",
      creditLimit: 0,
      outstanding: 0,
      avgLeadDays: 0,
    });
  }
  return supplier;
}

function newOrderNumber() {
  return `PO-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function newBatchNumber() {
  return `PB-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export type CreateProductionInput = {
  formulaId: string;
  qty: number;
  oilProductId?: string;
  outputProductId: string;
  outputQty?: number;
  notes?: string;
  createdBy?: string;
  /** If true, consume materials + create finished batch immediately. */
  complete?: boolean;
};

/**
 * Create a production order (draft) and optionally complete it.
 * Complete path: FIFO-consume planned materials → create production batch FIFO layer.
 */
export async function createProductionOrder(input: CreateProductionInput) {
  const plan = await planProduction({
    formulaId: input.formulaId,
    qty: input.qty,
    oilProductId: input.oilProductId,
  });

  if (!mongoose.isValidObjectId(input.outputProductId)) {
    throw new SaleError("PRODUCT_NOT_FOUND", "Output product is required");
  }

  const output = await Product.findById(input.outputProductId).lean<{
    _id: mongoose.Types.ObjectId;
    name: string;
    sku?: string;
    unit: string;
    itemType?: string;
  }>();
  if (!output) {
    throw new SaleError("PRODUCT_NOT_FOUND", "Output product not found");
  }

  const outputQty =
    input.outputQty !== undefined && Number(input.outputQty) > 0
      ? Number(input.outputQty)
      : plan.defaultOutputQty(output.unit);

  if (!(outputQty > 0)) {
    throw new SaleError("VALIDATION", "Output qty must be greater than 0");
  }

  const order = await ProductionOrder.create({
    orderNumber: newOrderNumber(),
    formulaId: plan.formulaId,
    formulaName: plan.formulaName,
    formulaType: plan.formulaType,
    formulaVersion: plan.formulaVersion,
    qty: plan.qty,
    yieldMl: plan.yieldMl * plan.qty,
    status: "draft",
    oilProductId: plan.oilProductId,
    oilProductName: plan.oilProductName,
    outputProductId: output._id,
    outputProductName: output.name,
    outputSku: output.sku || "",
    outputUnit: output.unit,
    outputQty,
    plannedLines: plan.plannedLines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      qty: l.qty,
      unit: l.unit,
      reason: l.reason,
    })),
    consumption: [],
    batch: null,
    notes: input.notes?.trim() || undefined,
    createdBy: input.createdBy,
  });

  if (input.complete) {
    return completeProductionOrder(String(order._id), {
      completedBy: input.createdBy,
    });
  }

  return order;
}

export async function completeProductionOrder(
  orderId: string,
  opts: { completedBy?: string } = {},
) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new SaleError("VALIDATION", "Invalid production order id");
  }

  const order = await ProductionOrder.findById(orderId);
  if (!order) {
    throw new SaleError("VALIDATION", "Production order not found");
  }
  if (order.status === "completed") {
    throw new SaleError("VALIDATION", "Production order already completed");
  }
  if (order.status === "cancelled") {
    throw new SaleError("VALIDATION", "Cancelled production orders cannot be completed");
  }

  const needs = order.plannedLines.map((l) => ({
    productId: String(l.productId),
    productName: l.productName,
    qty: Number(l.qty),
  }));

  let deductMap: Map<string, DeductFifoResult>;
  try {
    deductMap = await deductFifoMany(needs, { skipCostUpdate: false });
  } catch (err) {
    if (err instanceof SaleError) throw err;
    throw err;
  }

  const consumption = order.plannedLines.map((l) => {
    const result = deductMap.get(String(l.productId)) ?? {
      costTotal: 0,
      batches: [],
    };
    return {
      productId: l.productId,
      productName: l.productName,
      qty: Number(l.qty),
      reason: l.reason,
      costTotal: Number(result.costTotal.toFixed(3)),
      batches: result.batches.map((b) => ({
        layerId: b.layerId,
        qty: b.qty,
        unitCost: b.unitCost,
        purchaseDate: b.purchaseDate,
      })),
    };
  });

  const totalMaterialCost = Number(
    consumption.reduce((s, c) => s + c.costTotal, 0).toFixed(3),
  );
  const unitCost = Number(
    (totalMaterialCost / Math.max(order.outputQty, 1e-9)).toFixed(3),
  );

  const batchNumber = newBatchNumber();
  const producedAt = new Date();

  let layerId: string | undefined;
  try {
    const supplier = await ensureProductionSupplier();
    const layer = await addProductionFifoLayer({
      productId: String(order.outputProductId),
      supplierId: String(supplier._id),
      supplierName: `${PRODUCTION_SUPPLIER_NAME} · ${batchNumber}`,
      productionOrderId: String(order._id),
      purchaseDate: producedAt,
      qty: order.outputQty,
      unitCost,
      currency: "AED",
    });
    layerId = String(layer._id);
  } catch (err) {
    // Roll back material deductions if finished-goods layer fails
    await Promise.all(
      consumption.map((c) =>
        restoreFifo(String(c.productId), {
          costTotal: c.costTotal,
          batches: c.batches.map((b) => ({
            layerId: String(b.layerId),
            qty: b.qty,
            unitCost: b.unitCost,
            purchaseDate: b.purchaseDate,
          })),
        }),
      ),
    );
    throw err;
  }

  order.status = "completed";
  order.consumption = consumption;
  order.batch = {
    batchNumber,
    producedAt,
    outputProductId: order.outputProductId,
    outputProductName: order.outputProductName,
    outputSku: order.outputSku,
    outputQty: order.outputQty,
    outputUnit: order.outputUnit,
    unitCost,
    totalMaterialCost,
    fifoLayerId: layerId
      ? new mongoose.Types.ObjectId(layerId)
      : undefined,
  };
  order.completedAt = producedAt;
  order.completedBy = opts.completedBy;
  await order.save();

  return order;
}

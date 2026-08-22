import { PurchaseOrder, Supplier } from "@/lib/models";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Pure order→receipt day-gap averaging, split out for unit testing. */
export function averageLeadDays(
  orders: Array<{ date: Date | string; receivedAt: Date | string }>,
): number | null {
  if (!orders.length) return null;
  const totalDays = orders.reduce((sum, po) => {
    const orderedAt = new Date(po.date).getTime();
    const receivedAt = new Date(po.receivedAt).getTime();
    return sum + Math.max(0, receivedAt - orderedAt) / MS_PER_DAY;
  }, 0);
  return Math.round(totalDays / orders.length);
}

async function loadCompletedOrders(
  supplierId: string,
): Promise<Array<{ date: Date; receivedAt: Date }>> {
  const completed = await PurchaseOrder.find({
    supplierId,
    status: "received",
    receivedAt: { $ne: null },
  })
    .select("date receivedAt")
    .lean();
  return completed.map((po) => ({
    date: po.date as Date,
    receivedAt: po.receivedAt as Date,
  }));
}

async function updateSupplierAvgLeadDays(
  supplierId: string,
  avgLeadDays: number,
): Promise<void> {
  await Supplier.updateOne({ _id: supplierId }, { $set: { avgLeadDays } });
}

/**
 * PUR-12: recompute Supplier.avgLeadDays from actual order→receipt gaps
 * across that supplier's fully received purchase orders.
 *
 * `deps` default to the real DB-backed implementations; tests inject stubs
 * to verify the compute/skip logic without touching the database.
 */
export async function recalcSupplierAvgLeadDays(
  supplierId: string,
  deps: {
    loadCompletedOrders: typeof loadCompletedOrders;
    updateAvgLeadDays: typeof updateSupplierAvgLeadDays;
  } = { loadCompletedOrders, updateAvgLeadDays: updateSupplierAvgLeadDays },
): Promise<void> {
  const completed = await deps.loadCompletedOrders(supplierId);
  if (!completed.length) return;

  const avgLeadDays = averageLeadDays(completed);
  if (avgLeadDays === null) return;
  await deps.updateAvgLeadDays(supplierId, avgLeadDays);
}

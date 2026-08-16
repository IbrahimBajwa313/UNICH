import { PurchaseOrder, Supplier } from "@/lib/models";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * PUR-12: recompute Supplier.avgLeadDays from actual order→receipt gaps
 * across that supplier's fully received purchase orders.
 */
export async function recalcSupplierAvgLeadDays(
  supplierId: string,
): Promise<void> {
  const completed = await PurchaseOrder.find({
    supplierId,
    status: "received",
    receivedAt: { $ne: null },
  })
    .select("date receivedAt")
    .lean();

  if (!completed.length) return;

  const totalDays = completed.reduce((sum, po) => {
    const orderedAt = new Date(po.date as Date).getTime();
    const receivedAt = new Date(po.receivedAt as Date).getTime();
    return sum + Math.max(0, receivedAt - orderedAt) / MS_PER_DAY;
  }, 0);

  const avgLeadDays = Math.round(totalDays / completed.length);
  await Supplier.updateOne({ _id: supplierId }, { $set: { avgLeadDays } });
}

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { Expense, PurchaseOrder, Sale } from "../src/lib/models";

async function main() {
  await connectDB();
  const cutoff = new Date(Date.now() - 20 * 60 * 1000);
  const s = await Sale.deleteMany({ createdAt: { $gte: cutoff }, salesperson: { $in: ["Sara Ahmed", "Youssef Nasser", "Ahmad Ibrahim"] }, branchName: { $exists: true } });
  const e = await Expense.deleteMany({ createdAt: { $gte: cutoff } });
  const p = await PurchaseOrder.deleteMany({ createdAt: { $gte: cutoff } });
  console.log("Removed:", s.deletedCount, "sales,", e.deletedCount, "expenses,", p.deletedCount, "purchase orders");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

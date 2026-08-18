import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { getPeriodRange } from "../src/lib/reports/period";
import "../src/lib/reporting-engine/reports/index";
import { listReportsForRole } from "../src/lib/reporting-engine";
import { executeReport } from "../src/lib/reporting-engine/runner";
import { Branch, User } from "../src/lib/models";

async function main() {
  await connectDB();
  const branch = await Branch.findOne({ code: "MAIN" }).lean();
  const accountant = await User.findOne({ role: "accountant" }).lean();
  const session = {
    userId: String(accountant!._id),
    role: "accountant" as const,
    branchId: String(accountant!.branchId),
    name: accountant!.name,
  };

  const reports = listReportsForRole("accountant");
  console.log("Accountant reports:", reports.map((r) => r.id).join(", "));

  for (const period of ["daily", "weekly", "monthly"] as const) {
    console.log(`\n=== period: ${period} ===`);
    const { start, end } = getPeriodRange(period, new Date());
    for (const def of reports) {
      const result = await executeReport(
        def.id,
        { session: session as any },
        { from: start, to: end, branchId: null, compare: false, extra: {} },
      );
      console.log(`  ${def.id}: ${result.rows.length} rows`);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

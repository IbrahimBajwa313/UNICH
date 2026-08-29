import { connectDB } from "@/lib/db";
import { Customer } from "@/lib/models";
import { registerReport } from "../registry";
import type { ReportRow } from "../types";

/** RPT-06: customers carrying a credit balance — the collections/follow-up worklist. */
registerReport({
  id: "customers-credit-follow-up",
  label: "Customer credit follow-up",
  description: "Customers with an outstanding credit balance, sorted highest first.",
  category: "customer",
  branchScoped: false,
  columns: [
    { key: "name", label: "Customer", type: "string" },
    { key: "phone", label: "Phone", type: "string" },
    { key: "creditBalance", label: "Credit balance", type: "currency" },
    { key: "lastVisit", label: "Last visit", type: "date" },
  ],
  async run() {
    await connectDB();

    const customers = await Customer.find({ creditBalance: { $gt: 0 } })
      .sort({ creditBalance: -1 })
      .lean();

    const rows: ReportRow[] = customers.map((c) => ({
      name: c.name,
      phone: c.phone,
      creditBalance: Math.round((c.creditBalance || 0) * 100) / 100,
      lastVisit: c.lastVisit ? new Date(c.lastVisit).toISOString().slice(0, 10) : null,
    }));

    const totals = {
      customers: rows.length,
      creditBalance: Math.round(rows.reduce((s, r) => s + Number(r.creditBalance || 0), 0) * 100) / 100,
    };

    return { rows, totals };
  },
});

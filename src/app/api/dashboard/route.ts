import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Customer, Expense, Product, Sale, Supplier } from "@/lib/models";
import { moduleRoadmap } from "@/lib/constants";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";
import { hasPermission } from "@/lib/auth/roles";
import { resolveBranchScope } from "@/lib/reporting-engine/access";
import type { AppSession } from "@/lib/auth/session";

export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    // requireApiAccess only checks the coarse dashboard:read permission that
    // every role holds — scope the actual payload to each field's own
    // permission so e.g. accountant (no inventory:read/pos:read) never
    // receives stock levels or sales figures in the response body.
    const session = access as AppSession;
    const canPos = hasPermission(session.role, "pos:read");
    const canInventory = hasPermission(session.role, "inventory:read");
    const canReports = hasPermission(session.role, "reports:read");
    const canExpenses = hasPermission(session.role, "expenses:read");

    await connectDB();

    // Non-owner roles are pinned to their own branch, matching how the
    // reporting engine scopes its queries (src/lib/reporting-engine/access.ts).
    const branchScope = resolveBranchScope(session, null);
    const branchFilter =
      branchScope && Types.ObjectId.isValid(branchScope)
        ? { branchId: new Types.ObjectId(branchScope) }
        : {};

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todaySales = await Sale.find({
      status: "completed",
      createdAt: { $gte: startOfToday },
      ...branchFilter,
    });

    const todayTotal = todaySales.reduce((s, x) => s + x.total, 0);
    const remixCount = todaySales.filter((s) => s.saleType === "Remix").length;
    const transactionsToday = todaySales.length;
    const avgSaleValue =
      transactionsToday > 0
        ? Math.round((todayTotal / transactionsToday) * 100) / 100
        : 0;

    // POS dashboard charts — how today's till is being paid, and what's
    // actually moving off the shelf, at the front desk / cashier level.
    const paymentTotals = new Map<string, { amount: number; count: number }>();
    const productTotals = new Map<string, { qty: number; revenue: number; unit: string }>();
    for (const sale of todaySales) {
      const payEntry = paymentTotals.get(sale.payment) || { amount: 0, count: 0 };
      payEntry.amount += sale.total;
      payEntry.count += 1;
      paymentTotals.set(sale.payment, payEntry);

      for (const line of sale.lines || []) {
        const key = line.name;
        const prodEntry = productTotals.get(key) || {
          qty: 0,
          revenue: 0,
          unit: line.unitLabel || "",
        };
        prodEntry.qty += line.qty;
        prodEntry.revenue += line.qty * line.unitPrice;
        productTotals.set(key, prodEntry);
      }
    }
    const paymentMix = Array.from(paymentTotals.entries())
      .map(([method, { amount, count }]) => ({
        method: method.charAt(0).toUpperCase() + method.slice(1),
        amount: Math.round(amount * 100) / 100,
        count,
      }))
      .sort((a, b) => b.amount - a.amount);
    const topProductsToday = Array.from(productTotals.entries())
      .map(([name, { qty, revenue, unit }]) => ({
        name,
        qty: Math.round(qty * 1000) / 1000,
        unit,
        revenue: Math.round(revenue * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    const products = await Product.find();
    const fifoValue = products.reduce(
      (s, p) => s + p.stockSellable * p.costFifo,
      0,
    );
    const lowStock = products.filter(
      (p) => p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt,
    );

    // Inventory dashboard charts — stock value grouped by category (folded to
    // "Other" past the top N so the bar chart stays readable) and a
    // healthy/low/out split for the stock-health donut.
    const categoryTotals = new Map<string, { value: number; count: number }>();
    for (const p of products) {
      const entry = categoryTotals.get(p.category) || { value: 0, count: 0 };
      entry.value += p.stockSellable * p.costFifo;
      entry.count += 1;
      categoryTotals.set(p.category, entry);
    }
    const categoryRows = Array.from(categoryTotals.entries())
      .map(([category, { value, count }]) => ({
        category,
        value: Math.round(value * 100) / 100,
        count,
      }))
      .sort((a, b) => b.value - a.value);

    const TOP_CATEGORIES = 6;
    const stockByCategory =
      categoryRows.length <= TOP_CATEGORIES
        ? categoryRows
        : [
            ...categoryRows.slice(0, TOP_CATEGORIES - 1),
            categoryRows.slice(TOP_CATEGORIES - 1).reduce(
              (acc, row) => ({
                category: "Other",
                value: Math.round((acc.value + row.value) * 100) / 100,
                count: acc.count + row.count,
              }),
              { category: "Other", value: 0, count: 0 },
            ),
          ];

    const outOfStockCount = products.filter((p) => p.stockSellable === 0).length;
    const lowNotOutCount = products.filter(
      (p) =>
        p.stockSellable > 0 && p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt,
    ).length;
    const stockHealth = {
      healthy: products.length - outOfStockCount - lowNotOutCount,
      low: lowNotOutCount,
      out: outOfStockCount,
    };

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

    const weekSales = await Sale.find({
      status: "completed",
      createdAt: { $gte: weekAgo },
      ...branchFilter,
    });

    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const salesTrend = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekAgo);
      d.setDate(weekAgo.getDate() + i);
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);
      const daySales = weekSales.filter(
        (s) => s.createdAt >= dayStart && s.createdAt <= dayEnd,
      );
      return {
        label: labels[d.getDay()],
        retail: daySales
          .filter((s) => s.saleType === "Retail" || s.saleType === "Mixed")
          .reduce((sum, s) => sum + s.total, 0),
        wholesale: daySales
          .filter((s) => s.saleType === "Wholesale")
          .reduce((sum, s) => sum + s.total, 0),
        remix: daySales
          .filter(
            (s) =>
              s.saleType === "Remix" ||
              s.saleType === "Oil" ||
              s.saleType === "Refill",
          )
          .reduce((sum, s) => sum + s.total, 0),
      };
    });

    const weekTotal = weekSales.reduce((s, x) => s + x.total, 0);

    // Accountant-facing financial widgets — mirror the reporting engine's
    // cash-closing / expenses-by-category / profit-margin / credit-follow-up
    // aggregations (src/lib/reporting-engine/reports/*.ts) rather than
    // introducing new query logic.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const todayExpenses = await Expense.find({
      date: { $gte: startOfToday },
      ...branchFilter,
    });
    const todayExpenseTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);

    const monthExpenses = await Expense.find({
      date: { $gte: startOfMonth },
      ...branchFilter,
    });
    const monthExpenseTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

    const expenseCategoryTotals = new Map<string, number>();
    for (const e of monthExpenses) {
      expenseCategoryTotals.set(
        e.category,
        (expenseCategoryTotals.get(e.category) || 0) + e.amount,
      );
    }
    const expenseByCategory = Array.from(expenseCategoryTotals.entries())
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount);

    const monthSales = await Sale.find({
      status: "completed",
      createdAt: { $gte: startOfMonth },
      ...branchFilter,
    }).select("total inventoryDeductions");
    const monthRevenue = monthSales.reduce((s, sale) => s + sale.total, 0);
    const monthCost = monthSales.reduce(
      (s, sale) =>
        s +
        (sale.inventoryDeductions || []).reduce(
          (sum: number, d: { costTotal?: number }) => sum + (d.costTotal || 0),
          0,
        ),
      0,
    );
    const grossProfit = Math.round((monthRevenue - monthCost) * 100) / 100;
    const netProfit = Math.round((grossProfit - monthExpenseTotal) * 100) / 100;
    // Replaces the old hardcoded 42.6 stub — both margins now move with
    // actual sales/cost/expense data instead of showing a fixed number.
    const grossMarginPct =
      monthRevenue > 0 ? Math.round((grossProfit / monthRevenue) * 10000) / 100 : 0;
    const netProfitMarginPct =
      monthRevenue > 0 ? Math.round((netProfit / monthRevenue) * 10000) / 100 : 0;

    // Prior month, same math, purely for the trend badges on the margin
    // rings — real month-over-month comparison, not a placeholder delta.
    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfMonth.getMonth() - 1);
    const endOfLastMonth = new Date(startOfMonth.getTime() - 1);

    const lastMonthSales = await Sale.find({
      status: "completed",
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      ...branchFilter,
    }).select("total inventoryDeductions");
    const lastMonthRevenue = lastMonthSales.reduce((s, sale) => s + sale.total, 0);
    const lastMonthCost = lastMonthSales.reduce(
      (s, sale) =>
        s +
        (sale.inventoryDeductions || []).reduce(
          (sum: number, d: { costTotal?: number }) => sum + (d.costTotal || 0),
          0,
        ),
      0,
    );
    const lastMonthExpenses = await Expense.find({
      date: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      ...branchFilter,
    });
    const lastMonthExpenseTotal = lastMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const lastMonthGrossProfit = lastMonthRevenue - lastMonthCost;
    const lastMonthNetProfit = lastMonthGrossProfit - lastMonthExpenseTotal;
    const lastMonthGrossMarginPct =
      lastMonthRevenue > 0 ? (lastMonthGrossProfit / lastMonthRevenue) * 100 : 0;
    const lastMonthNetProfitMarginPct =
      lastMonthRevenue > 0 ? (lastMonthNetProfit / lastMonthRevenue) * 100 : 0;

    const grossMarginTrendPts = Math.round((grossMarginPct - lastMonthGrossMarginPct) * 100) / 100;
    const netMarginTrendPts =
      Math.round((netProfitMarginPct - lastMonthNetProfitMarginPct) * 100) / 100;

    // Customer.creditBalance / Supplier.outstanding are running balances, not
    // per-invoice open items — no due dates exist yet, so this is a total,
    // not an aged AR/AP report (see reporting-engine's cashClosing.ts note).
    const receivableCustomers = await Customer.find({
      creditBalance: { $gt: 0 },
    }).sort({ creditBalance: -1 });
    const accountsReceivable =
      Math.round(
        receivableCustomers.reduce((s, c) => s + (c.creditBalance || 0), 0) * 100,
      ) / 100;
    const topReceivables = receivableCustomers.slice(0, 5).map((c) => ({
      id: String(c._id),
      name: c.name,
      balance: Math.round((c.creditBalance || 0) * 100) / 100,
    }));

    const payableSuppliers = await Supplier.find({
      outstanding: { $gt: 0 },
    }).sort({ outstanding: -1 });
    const accountsPayable =
      Math.round(
        payableSuppliers.reduce((s, sup) => s + (sup.outstanding || 0), 0) * 100,
      ) / 100;
    const topPayables = payableSuppliers.slice(0, 5).map((sup) => ({
      id: String(sup._id),
      name: sup.name,
      balance: Math.round((sup.outstanding || 0) * 100) / 100,
    }));

    const netCash = Math.round((todayTotal - todayExpenseTotal) * 100) / 100;

    const alerts = [
      ...(canInventory
        ? [
            ...lowStock.map((p) => ({
              id: `low-${p._id}`,
              type: "low_stock" as const,
              title: `${p.name} below threshold`,
              detail: `${p.stockSellable} ${p.unit} remaining — threshold ${p.lowStockAt} ${p.unit}`,
              severity:
                p.stockSellable === 0
                  ? ("critical" as const)
                  : p.stockSellable <= p.lowStockAt * 0.5
                    ? ("critical" as const)
                    : ("warning" as const),
            })),
            ...products
              .filter((p) => {
                if (!p.lastSoldAt) return false;
                const days =
                  (Date.now() - new Date(p.lastSoldAt).getTime()) /
                  (1000 * 60 * 60 * 24);
                return days > 30 && p.stockSellable > 0;
              })
              .slice(0, 3)
              .map((p) => ({
                id: `dead-${p._id}`,
                type: "dead_stock" as const,
                title: `${p.name} slow movement`,
                detail: `No sale in 30+ days — review pricing`,
                severity: "info" as const,
              })),
          ]
        : []),
      ...(canReports
        ? [
            {
              id: "weekly-report",
              type: "report" as const,
              title: "Weekly sales report ready",
              detail: `Last 7 days · OMR ${weekTotal.toFixed(2)} total`,
              severity: "info" as const,
            },
          ]
        : []),
      ...(canExpenses
        ? [
            ...(accountsReceivable > 0
              ? [
                  {
                    id: "receivables-summary",
                    type: "receivables" as const,
                    title: `${receivableCustomers.length} customer${receivableCustomers.length === 1 ? "" : "s"} with outstanding balance`,
                    detail: `OMR ${accountsReceivable.toFixed(2)} total receivable`,
                    severity: "warning" as const,
                  },
                ]
              : []),
            ...(accountsPayable > 0
              ? [
                  {
                    id: "payables-summary",
                    type: "payables" as const,
                    title: `${payableSuppliers.length} supplier${payableSuppliers.length === 1 ? "" : "s"} with outstanding balance`,
                    detail: `OMR ${accountsPayable.toFixed(2)} total payable`,
                    severity: "warning" as const,
                  },
                ]
              : []),
          ]
        : []),
    ];

    const recentSales = todaySales
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 8)
      .map((s) => ({
        id: String(s._id),
        time: s.createdAt.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        customer: s.customerName,
        type: s.saleType,
        total: s.total,
        payment:
          s.payment.charAt(0).toUpperCase() + s.payment.slice(1),
      }));

    return NextResponse.json({
      stats: {
        ...(canPos && {
          todaySales: todayTotal,
          remixSales: remixCount,
          transactionsToday,
          avgSaleValue,
        }),
        ...(canReports && { grossMarginPct, grossMarginTrendPts, weekTotal }),
        ...(canInventory && {
          lowStockCount: lowStock.length,
          fifoValue,
          productCount: products.length,
        }),
        ...(canExpenses && {
          todayExpenseTotal,
          monthExpenseTotal,
          grossProfit,
          netProfit,
          netProfitMarginPct,
          netMarginTrendPts,
          accountsReceivable,
          accountsPayable,
          netCash,
        }),
      },
      ...(canPos && { salesTrend, recentSales, paymentMix, topProductsToday }),
      alerts,
      ...(canInventory && {
        lowStock: [...lowStock]
          .sort((a, b) => a.stockSellable / a.lowStockAt - b.stockSellable / b.lowStockAt)
          .map((p) => ({
            id: String(p._id),
            name: p.name,
            stockSellable: p.stockSellable,
            lowStockAt: p.lowStockAt,
            unit: p.unit,
          })),
        stockByCategory,
        stockHealth,
      }),
      ...(canExpenses && {
        expenseByCategory,
        topReceivables,
        topPayables,
      }),
      moduleRoadmap,
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to load dashboard") },
      { status: 500 },
    );
  }
}

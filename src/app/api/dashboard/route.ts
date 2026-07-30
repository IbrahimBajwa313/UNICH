import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Expense, Product, Sale } from "@/lib/models";
import { moduleRoadmap } from "@/lib/constants";

export async function GET() {
  try {
    await connectDB();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todaySales = await Sale.find({
      status: "completed",
      createdAt: { $gte: startOfToday },
    });

    const todayTotal = todaySales.reduce((s, x) => s + x.total, 0);
    const remixCount = todaySales.filter((s) => s.saleType === "Remix").length;

    const products = await Product.find();
    const fifoValue = products.reduce(
      (s, p) => s + p.stockSellable * p.costFifo,
      0,
    );
    const lowStock = products.filter(
      (p) => p.lowStockAt > 0 && p.stockSellable <= p.lowStockAt,
    );

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

    const weekSales = await Sale.find({
      status: "completed",
      createdAt: { $gte: weekAgo },
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
    const marginPct = 42.6;

    const alerts = [
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
      {
        id: "weekly-report",
        type: "report" as const,
        title: "Weekly sales report ready",
        detail: `Last 7 days · AED ${weekTotal.toFixed(2)} total`,
        severity: "info" as const,
      },
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

    const todayExpenses = await Expense.find({
      date: { $gte: startOfToday },
    });
    const todayExpenseTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);

    return NextResponse.json({
      stats: {
        todaySales: todayTotal,
        grossMarginPct: marginPct,
        remixSales: remixCount,
        lowStockCount: lowStock.length,
        fifoValue,
        weekTotal,
        todayExpenseTotal,
        productCount: products.length,
      },
      salesTrend,
      alerts,
      recentSales,
      lowStock: lowStock.map((p) => ({
        id: String(p._id),
        name: p.name,
        stockSellable: p.stockSellable,
        lowStockAt: p.lowStockAt,
        unit: p.unit,
      })),
      moduleRoadmap,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load dashboard" },
      { status: 500 },
    );
  }
}

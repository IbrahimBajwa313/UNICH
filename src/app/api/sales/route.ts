import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { deductFifo } from "@/lib/inventory";
import { Customer, Formula, Product, Sale } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

function mapSale(s: Record<string, unknown>) {
  const createdAt = s.createdAt ? new Date(s.createdAt as string) : new Date();
  return {
    ...s,
    time: createdAt.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    customer: s.customerName,
    type: s.saleType,
    payment:
      typeof s.payment === "string"
        ? s.payment.charAt(0).toUpperCase() + s.payment.slice(1)
        : s.payment,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || 20);
    const sales = await Sale.find({ status: "completed" })
      .sort({ createdAt: -1 })
      .limit(limit);
    return NextResponse.json(toJSONList(sales).map(mapSale));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load sales" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const {
      customerPhone,
      customerName,
      payment,
      lines,
      status = "completed",
    } = body;

    if (!customerPhone?.trim()) {
      throw new Error("Customer phone is required");
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new Error("At least one line item is required");
    }

    const subtotal = lines.reduce(
      (s: number, l: { qty: number; unitPrice: number }) =>
        s + Number(l.qty) * Number(l.unitPrice),
      0,
    );

    if (status === "completed") {
      for (const line of lines) {
        const qty = Number(line.qty);
        if (line.lineType === "ready" || line.lineType === "wholesale") {
          if (!line.productId) continue;
          await deductFifo(line.productId, qty);
        } else if (line.lineType === "oil" || line.lineType === "refill") {
          if (!line.productId) continue;
          const ml = Number(line.deductMl || 0) * qty;
          if (ml > 0) await deductFifo(line.productId, ml);
        } else if (line.lineType === "remix") {
          const remixFormula = await Formula.findOne({ type: "remix" });
          if (remixFormula) {
            for (const comp of remixFormula.components) {
              if (comp.productId === "oil-base") continue;
              if (!mongoose.isValidObjectId(comp.productId)) continue;
              await deductFifo(comp.productId, comp.qty * qty);
            }
          }
          if (line.oilProductId && line.oilMl) {
            await deductFifo(line.oilProductId, Number(line.oilMl) * qty);
          } else {
            const defaultOil = await Product.findOne({ sku: "PO-012" });
            if (defaultOil) await deductFifo(defaultOil._id, 20 * qty);
          }
        }
      }
    }

    let customer = await Customer.findOne({ phone: customerPhone.trim() });
    if (!customer) {
      customer = await Customer.create({
        name: customerName || "Walk-in Customer",
        phone: customerPhone.trim(),
        preferences: [],
        totalPurchases: 0,
        creditBalance: 0,
      });
    }

    if (status === "completed") {
      customer.totalPurchases += subtotal;
      customer.lastVisit = new Date();
      if (payment === "credit") {
        customer.creditBalance += subtotal;
      }
      await customer.save();
    }

    const types = new Set(lines.map((l: { lineType: string }) => l.lineType));
    let saleType = "Retail";
    if (types.has("remix")) saleType = "Remix";
    else if (types.has("oil")) saleType = "Oil";
    else if (types.has("refill")) saleType = "Refill";
    else if (types.has("wholesale")) saleType = "Wholesale";
    else if (types.size > 1) saleType = "Mixed";

    const sale = await Sale.create({
      customerPhone: customerPhone.trim(),
      customerName: customer.name,
      customerId: customer._id,
      payment,
      status,
      lines,
      subtotal,
      total: subtotal,
      saleType,
    });

    return NextResponse.json(mapSale(toJSON(sale)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create sale" },
      { status: 400 },
    );
  }
}

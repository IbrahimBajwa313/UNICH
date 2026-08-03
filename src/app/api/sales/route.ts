import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Sale } from "@/lib/models";
import { createSale } from "@/lib/sales/createSale";
import { SaleError } from "@/lib/sales/errors";
import { warmSaleCaches } from "@/lib/sales/validateSale";
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
    // Warm formula cache on POS boot (held-bills fetch) — first complete stays fast.
    void warmSaleCaches().catch(() => {
      /* non-fatal */
    });
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || 20);
    const status = searchParams.get("status") || "completed";
    const phone = searchParams.get("phone")?.trim();
    const customerId = searchParams.get("customerId")?.trim();
    const filter: Record<string, unknown> =
      status === "all"
        ? {}
        : { status: status as "completed" | "held" | "void" };
    if (customerId) {
      filter.customerId = customerId;
    } else if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 7) {
        // Escape regex metacharacters (e.g. leading + in +971…)
        const safeDigits = digits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.customerPhone = { $regex: safeDigits };
      } else {
        const safe = phone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.customerPhone = { $regex: safe, $options: "i" };
      }
    }
    const sales = await Sale.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
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
    const body = await req.json();
    const headerKey = req.headers.get("idempotency-key") || undefined;
    const { sale, deduplicated, timingMs } = await createSale({
      customerPhone: body.customerPhone,
      customerName: body.customerName,
      customerId: body.customerId,
      salesperson: body.salesperson,
      payment: body.payment,
      lines: body.lines,
      status: body.status,
      idempotencyKey: body.idempotencyKey || headerKey,
    });

    const payload = { ...mapSale(toJSON(sale)!), deduplicated, timingMs };
    const res = NextResponse.json(payload, {
      status: deduplicated ? 200 : 201,
    });
    if (timingMs?.total != null) {
      res.headers.set("Server-Timing", `sale;dur=${timingMs.total}`);
    }
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create sale";
    const status = error instanceof SaleError ? 400 : 400;
    return NextResponse.json(
      {
        error: message,
        code: error instanceof SaleError ? error.code : "UNKNOWN",
      },
      { status },
    );
  }
}

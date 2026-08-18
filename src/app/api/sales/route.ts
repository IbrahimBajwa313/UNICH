import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Sale } from "@/lib/models";
import { createSale } from "@/lib/sales/createSale";
import { SaleError } from "@/lib/sales/errors";
import { warmSaleCaches } from "@/lib/sales/validateSale";
import { toJSON, toJSONList } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";
import { recordAudit } from "@/lib/audit/log";
import { escapeRegex, loosePhoneRegex, phoneDigits } from "@/lib/phone";

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
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

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
    // Conditions are AND-ed via $and so the branch-isolation $or and the
    // customer-match $or (when both customerId and phone are given) can coexist.
    const conditions: Record<string, unknown>[] = [];
    if (status !== "all") {
      conditions.push({ status: status as "completed" | "held" | "void" });
    }
    if (
      access &&
      "role" in access &&
      access.role !== "owner" &&
      access.branchId
    ) {
      conditions.push({
        $or: [
          { branchId: access.branchId },
          { branchId: null },
          { branchId: { $exists: false } },
        ],
      });
    }
    if (customerId && phone) {
      // CRM-02: purchase history — match either the linked customerId or the
      // phone on record, since historical/seeded sales may only carry a phone.
      const digits = phoneDigits(phone);
      conditions.push({
        $or: [
          { customerId },
          {
            customerPhone:
              digits.length >= 7
                ? { $regex: loosePhoneRegex(digits) }
                : { $regex: escapeRegex(phone), $options: "i" },
          },
        ],
      });
    } else if (customerId) {
      conditions.push({ customerId });
    } else if (phone) {
      const digits = phoneDigits(phone);
      conditions.push({
        customerPhone:
          digits.length >= 7
            ? { $regex: loosePhoneRegex(digits) }
            : { $regex: escapeRegex(phone), $options: "i" },
      });
    }
    const filter = conditions.length > 0 ? { $and: conditions } : {};
    const sales = await Sale.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return NextResponse.json(toJSONList(sales).map(mapSale));
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to load sales") },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

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
      branchId: access?.branchId ?? undefined,
      branchName: access?.branchName ?? undefined,
    });

    if (!deduplicated) {
      recordAudit({
        session: access,
        action: "sale_created",
        entityType: "Sale",
        entityId: String((sale as { id?: string; _id?: unknown }).id ?? (sale as { _id?: unknown })._id ?? ""),
        detail: `${body.customerName || body.customerPhone || "walk-in"} · ${body.payment || ""}`,
        req,
      });
    }

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
      safeErrorMessage(error, "Failed to create sale");
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

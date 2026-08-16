import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";
import { escapeRegex, loosePhoneRegex, phoneDigits } from "@/lib/phone";

function mapQuote(q: Record<string, unknown>) {
  return {
    ...q,
    date: q.date ? new Date(q.date as string).toISOString().slice(0, 10) : null,
    expiry: q.expiry
      ? new Date(q.expiry as string).toISOString().slice(0, 10)
      : null,
  };
}

export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const phone = searchParams.get("phone")?.trim();
    const filter: Record<string, unknown> =
      status && status !== "all" ? { status } : {};
    // QTN-01: customer profile pulls its own open/converted quotations by phone.
    if (phone) {
      const digits = phoneDigits(phone);
      filter.customerPhone =
        digits.length >= 7
          ? { $regex: loosePhoneRegex(digits) }
          : { $regex: escapeRegex(phone), $options: "i" };
    }
    const quotations = await Quotation.find(filter).sort({ date: -1 });
    return NextResponse.json(toJSONList(quotations).map(mapQuote));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load quotations" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const body = await req.json();
    const count = await Quotation.countDocuments();
    const number =
      body.number ||
      `QT-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
    const quotation = await Quotation.create({
      ...body,
      number,
      date: new Date(body.date || Date.now()),
      expiry: new Date(
        body.expiry || Date.now() + 14 * 24 * 60 * 60 * 1000,
      ),
      status: body.status || "draft",
      branchId: access?.branchId ?? undefined,
      branchName: access?.branchName ?? undefined,
    });
    return NextResponse.json(mapQuote(toJSON(quotation)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quotation" },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { computeQuotationTotals } from "@/lib/quotation/calc";
import { normalizeQuotationLines } from "@/lib/quotation/lines";
import { loadQuotationSettings } from "@/lib/quotation/server";
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
    const customerId = searchParams.get("customerId")?.trim();
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
    if (customerId) filter.customerId = customerId;
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
    const settings = await loadQuotationSettings();

    const lines = normalizeQuotationLines(body.lines);
    const vatPercent = Number(body.vatPercent ?? settings.vatPercent ?? 0);
    const { subtotal, vatAmount, total } = computeQuotationTotals(lines, vatPercent);

    const count = await Quotation.countDocuments();
    const prefix = (body.number ? "" : settings.quotationNumberPrefix) || "QT";
    const number =
      body.number ||
      `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

    const validityDays = Number(body.validityDays ?? settings.quotationDefaultValidityDays ?? 14);
    const date = new Date(body.date || Date.now());
    const expiry = body.expiry
      ? new Date(body.expiry)
      : new Date(date.getTime() + validityDays * 24 * 60 * 60 * 1000);

    const quotation = await Quotation.create({
      number,
      customerId: body.customerId || undefined,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail || "",
      customerTrn: body.customerTrn || "",
      customerAddress: body.customerAddress || "",
      date,
      expiry,
      lines,
      subtotal,
      vatPercent,
      vatAmount,
      total,
      customerPoNumber: body.customerPoNumber || "",
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      paymentTerms: body.paymentTerms || "",
      deliveryTerms: body.deliveryTerms || "",
      validityDays,
      termsText: body.termsText || settings.quotationTermsTemplate || "",
      notes: body.notes || "",
      // QTN-02: signed in-store at creation time (e.g. tablet handed to a walk-in customer).
      signatureDataUrl: body.signatureDataUrl || "",
      signedByName: body.signatureDataUrl ? body.signedByName || body.customerName : "",
      signedAt: body.signatureDataUrl ? new Date() : undefined,
      status: "draft",
      version: 1,
      history: [
        {
          at: new Date(),
          by: access?.name || "System",
          action: "created",
          toStatus: "draft",
          toVersion: 1,
        },
      ],
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

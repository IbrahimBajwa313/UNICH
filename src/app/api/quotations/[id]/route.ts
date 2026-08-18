import { randomBytes } from "crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { deductFifoMany, refreshCostFifo } from "@/lib/inventory";
import { Customer, Quotation, Sale } from "@/lib/models";
import { computeQuotationTotals } from "@/lib/quotation/calc";
import { normalizeQuotationLines } from "@/lib/quotation/lines";
import { FAST_WC, resolveCustomerByPhone } from "@/lib/sales";
import { SaleError } from "@/lib/sales/errors";
import { toJSON } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";
import type { QuotationStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function mapQuote(q: Record<string, unknown>) {
  return {
    ...q,
    date: q.date ? new Date(q.date as string).toISOString().slice(0, 10) : null,
    expiry: q.expiry
      ? new Date(q.expiry as string).toISOString().slice(0, 10)
      : null,
  };
}

const EDITABLE_ANY_STATUS = new Set([
  "customerPoNumber",
  "attachments",
  "notes",
  "customerEmail",
  "customerAddress",
  "customerTrn",
]);

/** POS "convert from quotation" screen prefills its bill from this. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }
    return NextResponse.json(mapQuote(toJSON(quotation)!));
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to load quotation") },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    // Pricing (lines/terms/VAT) can only change on a draft — anything already
    // sent/approved must go through the `revise` action so history is preserved (QTN-05).
    const wantsPricingChange =
      body.lines !== undefined ||
      body.vatPercent !== undefined ||
      body.paymentTerms !== undefined ||
      body.deliveryTerms !== undefined ||
      body.validityDays !== undefined ||
      body.termsText !== undefined;
    if (wantsPricingChange && quotation.status !== "draft") {
      return NextResponse.json(
        {
          error:
            "This quotation is no longer a draft — use the revise action to change lines or terms.",
        },
        { status: 400 },
      );
    }

    if (wantsPricingChange) {
      if (body.lines !== undefined) quotation.lines = normalizeQuotationLines(body.lines);
      if (body.vatPercent !== undefined) quotation.vatPercent = Number(body.vatPercent) || 0;
      if (body.paymentTerms !== undefined) quotation.paymentTerms = body.paymentTerms;
      if (body.deliveryTerms !== undefined) quotation.deliveryTerms = body.deliveryTerms;
      if (body.validityDays !== undefined) quotation.validityDays = Number(body.validityDays) || 14;
      if (body.termsText !== undefined) quotation.termsText = body.termsText;
      const totals = computeQuotationTotals(quotation.lines, quotation.vatPercent);
      quotation.subtotal = totals.subtotal;
      quotation.vatAmount = totals.vatAmount;
      quotation.total = totals.total;
    }

    if (body.customerName !== undefined) quotation.customerName = body.customerName;
    if (body.customerPhone !== undefined) quotation.customerPhone = body.customerPhone;
    if (body.customerId !== undefined) quotation.customerId = body.customerId || undefined;
    if (body.date) quotation.date = new Date(body.date);
    if (body.expiry) quotation.expiry = new Date(body.expiry);
    for (const key of EDITABLE_ANY_STATUS) {
      if (body[key] !== undefined) {
        (quotation as unknown as Record<string, unknown>)[key] = body[key];
      }
    }
    // QTN-02: signed in-store (e.g. tablet handed to the customer while editing a draft).
    if (body.signatureDataUrl) {
      quotation.signatureDataUrl = body.signatureDataUrl;
      quotation.signedByName = body.signedByName || quotation.customerName;
      quotation.signedAt = new Date();
    }

    if (body.status && body.status !== quotation.status) {
      const fromStatus = quotation.status as QuotationStatus;
      quotation.status = body.status;
      quotation.history.push({
        at: new Date(),
        by: access?.name || "System",
        action: "status_changed",
        fromStatus,
        toStatus: body.status,
      });
    }

    await quotation.save(FAST_WC);
    return NextResponse.json(mapQuote(toJSON(quotation)!));
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to update quotation") },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }
    if (quotation.convertedToSaleId) {
      return NextResponse.json(
        { error: "Cannot delete a quotation that has already been converted to a sale" },
        { status: 400 },
      );
    }
    await quotation.deleteOne();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to delete quotation") },
      { status: 500 },
    );
  }
}

/** QTN-05 revise / QTN-06 convert / QTN-10 share actions. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = body.action || "convert";
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    if (action === "revise") {
      const fromVersion = quotation.version;
      const fromStatus = quotation.status as QuotationStatus;

      // QTN-05: snapshot the pre-revision state before applying any change.
      quotation.versions.push({
        version: quotation.version,
        status: quotation.status,
        lines: quotation.lines,
        subtotal: quotation.subtotal,
        vatPercent: quotation.vatPercent,
        vatAmount: quotation.vatAmount,
        total: quotation.total,
        paymentTerms: quotation.paymentTerms,
        deliveryTerms: quotation.deliveryTerms,
        validityDays: quotation.validityDays,
        termsText: quotation.termsText,
        notes: quotation.notes,
        savedAt: new Date(),
        savedBy: access?.name || "System",
      });

      if (body.lines !== undefined) quotation.lines = normalizeQuotationLines(body.lines);
      if (body.vatPercent !== undefined) quotation.vatPercent = Number(body.vatPercent) || 0;
      if (body.paymentTerms !== undefined) quotation.paymentTerms = body.paymentTerms;
      if (body.deliveryTerms !== undefined) quotation.deliveryTerms = body.deliveryTerms;
      if (body.validityDays !== undefined) quotation.validityDays = Number(body.validityDays) || 14;
      if (body.termsText !== undefined) quotation.termsText = body.termsText;
      if (body.notes !== undefined) quotation.notes = body.notes;
      if (body.expiry) quotation.expiry = new Date(body.expiry);
      if (body.customerName !== undefined) quotation.customerName = body.customerName;
      if (body.customerPhone !== undefined) quotation.customerPhone = body.customerPhone;
      if (body.customerId !== undefined) quotation.customerId = body.customerId || undefined;
      for (const key of EDITABLE_ANY_STATUS) {
        if (body[key] !== undefined) {
          (quotation as unknown as Record<string, unknown>)[key] = body[key];
        }
      }

      const totals = computeQuotationTotals(quotation.lines, quotation.vatPercent);
      quotation.subtotal = totals.subtotal;
      quotation.vatAmount = totals.vatAmount;
      quotation.total = totals.total;

      quotation.version = fromVersion + 1;
      quotation.status = "revised";
      // A fresh revision voids the prior approval/signature — the customer must review it again.
      quotation.approvalToken = undefined;
      quotation.approvalTokenExpiresAt = undefined;
      quotation.publicViewedAt = undefined;
      quotation.customerDecision = undefined;
      quotation.customerDecisionAt = undefined;
      quotation.customerDecisionNote = "";
      quotation.signatureDataUrl = "";
      quotation.signedByName = "";
      quotation.signedAt = undefined;
      // Re-signed in-store as part of this same revision (rare, but supported).
      if (body.signatureDataUrl) {
        quotation.signatureDataUrl = body.signatureDataUrl;
        quotation.signedByName = body.signedByName || quotation.customerName;
        quotation.signedAt = new Date();
      }

      quotation.history.push({
        at: new Date(),
        by: access?.name || "System",
        action: "revised",
        fromStatus,
        toStatus: "revised",
        fromVersion,
        toVersion: quotation.version,
      });

      await quotation.save(FAST_WC);
      return NextResponse.json(mapQuote(toJSON(quotation)!));
    }

    if (action === "share") {
      if (!quotation.approvalToken) {
        quotation.approvalToken = randomBytes(24).toString("base64url");
      }
      quotation.approvalTokenExpiresAt = quotation.expiry;
      if (quotation.status === "draft") {
        quotation.status = "sent";
      }
      quotation.history.push({
        at: new Date(),
        by: access?.name || "System",
        action: "shared",
      });
      await quotation.save(FAST_WC);
      return NextResponse.json({
        quotation: mapQuote(toJSON(quotation)!),
        approvalToken: quotation.approvalToken,
      });
    }

    if (action === "convert") {
      if (quotation.status !== "approved") {
        return NextResponse.json(
          { error: "Only approved quotations can be converted" },
          { status: 400 },
        );
      }
      if (quotation.convertedToSaleId) {
        return NextResponse.json(
          { error: "Quotation already converted" },
          { status: 400 },
        );
      }
      if (!quotation.lines.length) {
        return NextResponse.json(
          { error: "Quotation has no line items to convert" },
          { status: 400 },
        );
      }

      const PAYMENT_METHODS = new Set(["cash", "card", "bank", "credit", "mixed"]);
      const payment = PAYMENT_METHODS.has(body.payment) ? body.payment : "credit";

      // QTN-06: carry every line item across as-is — no re-entry.
      const lines = quotation.lines.map((line: (typeof quotation.lines)[number]) => ({
        productId: line.productId,
        name: line.name,
        qty: line.qty,
        unitLabel: line.unitLabel,
        unitPrice: line.unitPrice,
        lineType: line.lineType === "custom_blend" ? "remix" : line.lineType,
        formulaId: line.formulaId,
        packagingProductIds: line.packagingProductIds,
      }));

      // Deduct real stock before touching the customer/sale — a POS-driven convert
      // is a real checkout, not just a paper record. Lines without a catalog
      // product (e.g. a custom remix blend, which has no oil/formula captured at
      // quotation time) are skipped here, same as before this change.
      const deductable = lines.filter(
        (l: { productId?: unknown; qty: number }) => l.productId,
      ) as Array<{ productId: mongoose.Types.ObjectId; qty: number; name: string }>;
      const deductions = await deductFifoMany(
        deductable.map((l) => ({
          productId: String(l.productId),
          qty: l.qty,
          productName: l.name,
        })),
      );
      const inventoryDeductions = deductable.map((l, i) => {
        const result = deductions.get(String(l.productId)) ?? { costTotal: 0, batches: [] };
        return {
          productId: l.productId,
          productName: l.name,
          qty: l.qty,
          reason: "quotation_convert",
          lineIndex: i,
          costTotal: result.costTotal,
          batches: result.batches.map((b) => ({
            layerId: new mongoose.Types.ObjectId(b.layerId),
            qty: b.qty,
            unitCost: b.unitCost,
            purchaseDate: b.purchaseDate,
          })),
        };
      });

      // CRM-02: a converted quotation is a real order — the customer must show up
      // in Customers with this purchase, same as a POS checkout does (createSale()).
      const productNames = [...new Set(lines.map((l: { name: string }) => l.name).filter(Boolean))];
      const customerTouch = {
        $set: {
          lastVisit: new Date(),
          ...(quotation.customerName ? { name: quotation.customerName } : {}),
        },
        $inc: {
          totalPurchases: quotation.total,
          ...(payment === "credit" ? { creditBalance: quotation.total } : {}),
        },
        ...(productNames.length > 0
          ? { $addToSet: { productsRequested: { $each: productNames } } }
          : {}),
      };
      let customerObjectId = quotation.customerId;
      if (customerObjectId) {
        await Customer.updateOne({ _id: customerObjectId }, customerTouch, {
          writeConcern: FAST_WC,
        });
      } else {
        customerObjectId = await resolveCustomerByPhone(
          quotation.customerPhone,
          quotation.customerName,
          customerTouch,
        );
        quotation.customerId = customerObjectId;
      }

      // Perf: skip mongoose's Sale.create()/quotation.save() (full-document
      // validation + default majority write concern) — insert the sale natively
      // and patch just the changed quotation fields, both at primary-only ack,
      // and run them in parallel since neither write depends on the other.
      const saleId = new mongoose.Types.ObjectId();
      const now = new Date();
      const saleDoc = {
        _id: saleId,
        customerPhone: quotation.customerPhone,
        customerName: quotation.customerName,
        customerId: customerObjectId,
        salesperson: access?.name || "Quotation Conversion",
        payment,
        status: "completed",
        saleType: "Wholesale",
        subtotal: quotation.subtotal,
        total: quotation.total,
        lines,
        inventoryDeductions,
        ...(access?.branchId
          ? { branchId: new mongoose.Types.ObjectId(access.branchId) }
          : {}),
        ...(access?.branchName ? { branchName: access.branchName } : {}),
        createdAt: now,
        updatedAt: now,
      };

      const historyEntry = {
        at: now,
        by: access?.name || "System",
        action: "converted",
        detail: String(saleId),
      };

      quotation.convertedToSaleId = saleId;
      quotation.status = "converted";
      quotation.history.push(historyEntry);

      await Promise.all([
        Sale.collection.insertOne(saleDoc, { writeConcern: FAST_WC }),
        Quotation.updateOne(
          { _id: quotation._id },
          {
            $set: {
              convertedToSaleId: saleId,
              status: "converted",
              ...(quotation.customerId ? { customerId: quotation.customerId } : {}),
            },
            $push: { history: historyEntry },
          },
          { writeConcern: FAST_WC },
        ),
      ]);

      if (deductable.length > 0) {
        void refreshCostFifo(deductable.map((l) => String(l.productId))).catch(() => {
          /* non-fatal — after response */
        });
      }

      return NextResponse.json({
        quotation: mapQuote(toJSON(quotation)!),
        sale: toJSON(saleDoc),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to process quotation") },
      { status: error instanceof SaleError ? 400 : 500 },
    );
  }
}

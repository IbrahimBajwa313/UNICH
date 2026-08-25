import { NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/auth/apiGuard";
import { connectDB } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { loadQuotationSettings, quotationDocFromRecord } from "@/lib/quotation/server";
import { renderQuotationHtml } from "@/lib/quotation/template";

type Ctx = { params: Promise<{ token: string }> };

/** QTN-10 — lets the customer print/save-as-PDF from the public approval page. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { token } = await ctx.params;
    const quotation = await Quotation.findOne({ approvalToken: token }).lean<Record<string, unknown>>();
    if (!quotation) {
      return NextResponse.json({ error: "Quotation link not found" }, { status: 404 });
    }

    const settings = await loadQuotationSettings();
    const doc = quotationDocFromRecord(quotation, settings);

    return new Response(renderQuotationHtml(doc), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, "Failed to render quotation"),
      },
      { status: 500 },
    );
  }
}

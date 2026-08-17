import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { loadQuotationSettings, quotationDocFromRecord } from "@/lib/quotation/server";
import { renderQuotationHtml } from "@/lib/quotation/template";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const quotation = await Quotation.findById(id).lean<Record<string, unknown>>();
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
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
        error: error instanceof Error ? error.message : "Failed to render quotation",
      },
      { status: 500 },
    );
  }
}

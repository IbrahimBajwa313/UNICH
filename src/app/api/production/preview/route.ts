import { NextResponse } from "next/server";
import {
  isFormulaAdminResponse,
  requireFormulaAdmin,
} from "@/lib/auth/formulaAdmin";
import { connectDB } from "@/lib/db";
import { planProduction } from "@/lib/production/planProduction";
import { SaleError } from "@/lib/sales/errors";
import { Product } from "@/lib/models";

export async function POST(req: Request) {
  try {
    const admin = requireFormulaAdmin(req);
    if (isFormulaAdminResponse(admin)) return admin;

    await connectDB();
    const body = await req.json();

    const plan = await planProduction({
      formulaId: String(body.formulaId || ""),
      qty: Number(body.qty),
      oilProductId: body.oilProductId ? String(body.oilProductId) : undefined,
    });

    let defaultOutputQty = plan.qty;
    if (body.outputProductId) {
      const output = await Product.findById(body.outputProductId)
        .select("unit")
        .lean<{ unit?: string }>();
      if (output?.unit) {
        defaultOutputQty = plan.defaultOutputQty(output.unit);
      }
    }

    return NextResponse.json({
      formulaId: plan.formulaId,
      formulaName: plan.formulaName,
      formulaType: plan.formulaType,
      formulaVersion: plan.formulaVersion,
      qty: plan.qty,
      yieldMl: plan.yieldMl * plan.qty,
      needsOilSelection: plan.needsOilSelection,
      oilProductId: plan.oilProductId,
      oilProductName: plan.oilProductName,
      plannedLines: plan.plannedLines,
      defaultOutputQty,
    });
  } catch (error) {
    if (error instanceof SaleError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to preview production",
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import {
  isFormulaAdminResponse,
  requireFormulaAdmin,
} from "@/lib/auth/formulaAdmin";
import { connectDB } from "@/lib/db";
import { checkStockAvailability } from "@/lib/inventory/stockCheck";
import { planProduction } from "@/lib/production/planProduction";
import { SaleError } from "@/lib/sales/errors";
import { Product } from "@/lib/models";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";

export async function POST(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

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

    // INV-06: warn on any material shortfall before produce (not sale-only)
    const stock = await checkStockAvailability(
      plan.plannedLines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        productName: l.productName,
      })),
    );

    const plannedLines = plan.plannedLines.map((l) => {
      const row = stock.shortages.find((s) => s.productId === l.productId);
      return {
        ...l,
        stockAvailable: row?.available ?? 0,
        fifoAvailable: row?.fifoAvailable ?? 0,
        stockShort: row?.short ?? false,
        stockWarning: row?.short ? row.warning : undefined,
      };
    });

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
      plannedLines,
      defaultOutputQty,
      stockOk: stock.ok,
      stockWarnings: stock.warnings,
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

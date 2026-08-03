import { NextResponse } from "next/server";
import {
  isFormulaAdminResponse,
  requireFormulaAdmin,
} from "@/lib/auth/formulaAdmin";
import { connectDB } from "@/lib/db";
import { completeProductionOrder } from "@/lib/production/completeProduction";
import { mapProductionOrder } from "@/lib/production/mapProduction";
import { SaleError } from "@/lib/sales/errors";
import { toJSON } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const admin = requireFormulaAdmin(req);
    if (isFormulaAdminResponse(admin)) return admin;

    await connectDB();
    const { id } = await ctx.params;
    const order = await completeProductionOrder(id, {
      completedBy: admin.name,
    });

    return NextResponse.json(
      mapProductionOrder(toJSON(order)! as Record<string, unknown>),
    );
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
          error instanceof Error
            ? error.message
            : "Failed to complete production order",
      },
      { status: 400 },
    );
  }
}

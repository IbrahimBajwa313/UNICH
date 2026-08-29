import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import type { ExcelProductRow } from "@/lib/excel/columns";
import { buildErrorReport } from "@/lib/excel/errorReport";
import { ImportBatch } from "@/lib/models";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ batchId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { batchId } = await ctx.params;
    const batch = await ImportBatch.findOne({ batchId }).lean();
    if (!batch) {
      return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
    }

    const rawByRow = new Map<number, ExcelProductRow>();
    for (const r of (batch.rawRows as ExcelProductRow[]) || []) {
      rawByRow.set(r.rowNumber, r);
    }

    const failed = (batch.rows || [])
      .filter((r: { action: string }) => r.action === "error")
      .map(
        (r: {
          rowNumber: number;
          sku?: string;
          errorReason?: string;
          payload?: Record<string, unknown> | null;
        }) => {
        const raw = rawByRow.get(r.rowNumber);
        const payload =
          (r.payload as Record<string, unknown>) ||
          (raw
            ? {
                sku: raw.internalCode,
                name: raw.name,
                category: raw.category,
                brand: raw.brand,
                concentration: raw.concentration,
                unit: raw.unit,
                costFifo: raw.costPrice,
                sellPrice: raw.retailPrice,
                wholesalePrice: raw.wholesalePrice,
                gender: raw.gender,
                size: raw.size,
                collection: raw.collection,
                notes: raw.notes,
                itemType: raw.itemType,
              }
            : null);
        return {
          rowNumber: r.rowNumber,
          sku: r.sku,
          errorReason: r.errorReason || "Unknown error",
          payload,
        };
      });

    const buffer = buildErrorReport(failed);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="import-errors-${batchId}.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to build error report") },
      { status: 500 },
    );
  }
}

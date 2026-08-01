import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  parseAnchorDate,
  parseReportPeriod,
} from "@/lib/reports/period";
import { buildSaleReport, type SaleReportStatus } from "@/lib/reports/salesReport";

export const runtime = "nodejs";

function parseStatus(value: string | null): SaleReportStatus {
  return value === "held" ? "held" : "completed";
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const report = await buildSaleReport({
      status: parseStatus(searchParams.get("status")),
      period: parseReportPeriod(searchParams.get("period")),
      anchor: parseAnchorDate(searchParams.get("date")),
      limit: Number(searchParams.get("limit") || 500),
    });
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load sales report",
      },
      { status: 500 },
    );
  }
}

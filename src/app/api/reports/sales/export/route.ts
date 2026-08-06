import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  parseAnchorDate,
  parseReportPeriod,
} from "@/lib/reports/period";
import {
  buildSaleReport,
  buildSaleReportExcel,
  type SaleReportStatus,
} from "@/lib/reports/salesReport";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";

export const runtime = "nodejs";

function parseStatus(value: string | null): SaleReportStatus {
  return value === "held" ? "held" : "completed";
}

export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = parseStatus(searchParams.get("status"));
    const period = parseReportPeriod(searchParams.get("period"));
    const date = searchParams.get("date");
    const report = await buildSaleReport({
      status,
      period,
      anchor: parseAnchorDate(date),
      limit: Number(searchParams.get("limit") || 2000),
    });
    const buffer = buildSaleReportExcel(report);
    const stamp = report.label.replace(/[^\w.-]+/g, "_");
    const filename = `${status}-${period}-${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to export sales report",
      },
      { status: 500 },
    );
  }
}

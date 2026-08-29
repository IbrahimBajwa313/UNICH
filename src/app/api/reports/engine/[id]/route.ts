import { NextResponse } from "next/server";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";
import {
  executeReport,
  parseReportFilters,
  reportToCsv,
  ReportAccessDeniedError,
  ReportNotFoundError,
} from "@/lib/reporting-engine";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;
    if (access === null) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const filters = parseReportFilters(searchParams);

    const result = await executeReport(id, { session: access }, filters);

    if (searchParams.get("format") === "csv") {
      return new NextResponse(reportToCsv(result), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${result.id}.csv"`,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReportNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ReportAccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to run report") },
      { status: 500 },
    );
  }
}

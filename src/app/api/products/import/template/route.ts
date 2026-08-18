import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { buildTemplateWorkbook } from "@/lib/excel/template";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const buffer = buildTemplateWorkbook();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="unich-product-import-template.xlsx"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to build template") },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";
import { listReportsForRole } from "@/lib/reporting-engine";

export const runtime = "nodejs";

/** Catalog of reports the caller's role may run — powers a future reports picker UI. */
export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;
    if (access === null) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const reports = listReportsForRole(access.role).map((def) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      category: def.category,
      columns: def.columns,
    }));

    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to load report catalog") },
      { status: 500 },
    );
  }
}

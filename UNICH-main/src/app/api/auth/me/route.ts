import { NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/auth/apiGuard";
import { permissionsForRole } from "@/lib/auth/roles";
import { getSessionFromRequest } from "@/lib/auth/session";
import type { AuthMe } from "@/lib/types";

/**
 * GET /api/auth/me — cookie-only (no DB).
 * Session is HMAC-signed; role/branch come from the token so UI unlocks in <100ms.
 * Active-user checks happen at login (and on protected API writes via session).
 */
export async function GET(req: Request) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      const body: AuthMe = {
        authenticated: false,
        user: null,
        permissions: [],
      };
      return NextResponse.json(body);
    }

    const body: AuthMe = {
      authenticated: true,
      user: {
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
        roleLabel: session.roleLabel,
        branchId: session.branchId,
        branchName: session.branchName,
        active: true,
      },
      permissions: permissionsForRole(session.role),
    };
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, "Failed to load session"),
      },
      { status: 500 },
    );
  }
}

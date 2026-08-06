import { NextResponse } from "next/server";
import { ensureAuthBootstrap } from "@/lib/auth/bootstrap";
import { mapUserPublic } from "@/lib/auth/mapUser";
import { permissionsForRole } from "@/lib/auth/roles";
import { getSessionFromRequest } from "@/lib/auth/session";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import type { AuthMe } from "@/lib/types";

/** GET /api/auth/me — current session user + permissions. */
export async function GET(req: Request) {
  try {
    await ensureAuthBootstrap();
    const session = getSessionFromRequest(req);
    if (!session) {
      const body: AuthMe = {
        authenticated: false,
        user: null,
        permissions: [],
      };
      return NextResponse.json(body);
    }

    await connectDB();
    const user = await User.findById(session.userId);
    if (!user || !user.active) {
      const body: AuthMe = {
        authenticated: false,
        user: null,
        permissions: [],
      };
      return NextResponse.json(body);
    }

    const mapped = mapUserPublic(user)!;
    const body: AuthMe = {
      authenticated: true,
      user: mapped,
      permissions: permissionsForRole(mapped.role),
    };
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load session",
      },
      { status: 500 },
    );
  }
}

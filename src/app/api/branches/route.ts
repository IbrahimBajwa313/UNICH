import { NextResponse } from "next/server";
import {
  isAuthResponse,
  requirePermission,
} from "@/lib/auth/guards";
import { connectDB } from "@/lib/db";
import { Branch } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

/** GET /api/branches — list branches. */
export async function GET(req: Request) {
  try {
    const auth = requirePermission(req, "branches:read");
    if (isAuthResponse(auth)) return auth;

    await connectDB();
    const filter =
      auth.role === "super_admin"
        ? {}
        : auth.branchId
          ? { _id: auth.branchId }
          : { active: true };

    const branches = await Branch.find(filter).sort({ name: 1 });
    return NextResponse.json(toJSONList(branches));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list branches",
      },
      { status: 500 },
    );
  }
}

/** POST /api/branches — create branch (super_admin). */
export async function POST(req: Request) {
  try {
    const auth = requirePermission(req, "branches:write");
    if (isAuthResponse(auth)) return auth;

    await connectDB();
    const body = (await req.json()) as {
      name?: string;
      code?: string;
      active?: boolean;
    };
    const name = (body.name || "").trim();
    const code = (body.code || "").trim().toUpperCase();
    if (!name || !code) {
      return NextResponse.json(
        { error: "name and code are required." },
        { status: 400 },
      );
    }

    const existing = await Branch.findOne({ code });
    if (existing) {
      return NextResponse.json(
        { error: "Branch code already exists." },
        { status: 409 },
      );
    }

    const branch = await Branch.create({
      name,
      code,
      active: body.active !== false,
    });
    return NextResponse.json(toJSON(branch), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create branch",
      },
      { status: 400 },
    );
  }
}

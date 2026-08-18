import { NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/auth/apiGuard";
import {
  isAuthResponse,
  requirePermission,
} from "@/lib/auth/guards";
import { mapUserPublic } from "@/lib/auth/mapUser";
import { hashPassword } from "@/lib/auth/password";
import {
  isUserRole,
  ROLE_LABELS,
} from "@/lib/auth/roles";
import { connectDB } from "@/lib/db";
import { Branch, User } from "@/lib/models";
import type { UserRole } from "@/lib/types";

/** GET /api/users — list users (admin). */
export async function GET(req: Request) {
  try {
    const auth = requirePermission(req, "users:read");
    if (isAuthResponse(auth)) return auth;

    await connectDB();
    const users = await User.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(users.map((u) => mapUserPublic(u)!));
  } catch (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, "Failed to list users"),
      },
      { status: 500 },
    );
  }
}

/** POST /api/users — create user with role + branch. */
export async function POST(req: Request) {
  try {
    const auth = requirePermission(req, "users:write");
    if (isAuthResponse(auth)) return auth;

    await connectDB();
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      branchId?: string | null;
      active?: boolean;
    };

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const role = body.role;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "name, email, and password are required." },
        { status: 400 },
      );
    }
    if (!isUserRole(role)) {
      return NextResponse.json(
        { error: "Invalid role." },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 },
      );
    }

    // Only super_admin can create another super_admin
    if (role === "super_admin" && auth.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only Super Admin can create Super Admin users." },
        { status: 403 },
      );
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 },
      );
    }

    let branchId: string | null = body.branchId ? String(body.branchId) : null;
    let branchName: string | null = null;

    if (role !== "super_admin") {
      if (!branchId) {
        return NextResponse.json(
          { error: "branchId is required for this role." },
          { status: 400 },
        );
      }
    }

    if (branchId) {
      const branch = await Branch.findById(branchId);
      if (!branch || !branch.active) {
        return NextResponse.json(
          { error: "Invalid or inactive branch." },
          { status: 400 },
        );
      }
      // Non–super-admin admins can only assign their own branch
      if (
        auth.role !== "super_admin" &&
        auth.branchId &&
        String(branch._id) !== auth.branchId
      ) {
        return NextResponse.json(
          { error: "You can only assign users to your own branch." },
          { status: 403 },
        );
      }
      branchId = String(branch._id);
      branchName = branch.name;
    }

    const user = await User.create({
      name,
      email,
      passwordHash: hashPassword(password),
      role: role as UserRole,
      roleLabel: ROLE_LABELS[role as UserRole],
      branchId,
      branchName,
      active: body.active !== false,
    });

    return NextResponse.json(mapUserPublic(user), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, "Failed to create user"),
      },
      { status: 400 },
    );
  }
}

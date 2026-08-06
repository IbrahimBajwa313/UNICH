import { NextResponse } from "next/server";
import { ensureAuthBootstrap } from "@/lib/auth/bootstrap";
import { mapUserPublic } from "@/lib/auth/mapUser";
import { verifyPassword } from "@/lib/auth/password";
import { ROLE_LABELS } from "@/lib/auth/roles";
import {
  createSessionToken,
  sessionCookieHeader,
} from "@/lib/auth/session";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";

/** POST /api/auth/login — email + password → session cookie. */
export async function POST(req: Request) {
  try {
    await ensureAuthBootstrap();
    await connectDB();

    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const user = await User.findOne({ email });
    if (!user || !user.active) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    user.lastLoginAt = new Date();
    const role = user.role as keyof typeof ROLE_LABELS;
    if (!user.roleLabel) {
      user.roleLabel = ROLE_LABELS[role] || user.role;
    }
    await user.save();

    const token = createSessionToken({
      userId: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: user.roleLabel || ROLE_LABELS[role],
      branchId: user.branchId ? String(user.branchId) : null,
      branchName: user.branchName || null,
    });

    const res = NextResponse.json({
      ok: true,
      user: mapUserPublic(user),
    });
    res.headers.set("Set-Cookie", sessionCookieHeader(token));
    return res;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Login failed",
      },
      { status: 500 },
    );
  }
}

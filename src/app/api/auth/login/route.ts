import { NextResponse } from "next/server";
import {
  ensureAuthBootstrap,
  isAuthBootstrapped,
} from "@/lib/auth/bootstrap";
import { mapUserPublic } from "@/lib/auth/mapUser";
import { verifyPassword } from "@/lib/auth/password";
import { permissionsForRole, ROLE_LABELS } from "@/lib/auth/roles";
import {
  applySessionCookie,
  createSessionToken,
} from "@/lib/auth/session";
import { AUTH_TIMEOUT_MS, withAuthTimeout } from "@/lib/auth/timeout";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";

async function loginHandler(req: Request) {
  // Bootstrap only once per process; otherwise just ensure DB pool is ready.
  if (isAuthBootstrapped()) {
    await connectDB();
  } else {
    await ensureAuthBootstrap();
  }

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

  // Lean + projected fields — one round-trip, no full document hydrate.
  const user = await User.findOne({ email })
    .select(
      "name email passwordHash role roleLabel branchId branchName active",
    )
    .lean();

  if (!user || user.active === false) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  if (!verifyPassword(password, user.passwordHash as string)) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const role = user.role as keyof typeof ROLE_LABELS;
  const roleLabel =
    (user.roleLabel as string) || ROLE_LABELS[role] || String(user.role);

  // Don't block the response on lastLoginAt write.
  void User.updateOne(
    { _id: user._id },
    {
      $set: {
        lastLoginAt: new Date(),
        ...(user.roleLabel ? {} : { roleLabel }),
      },
    },
  ).exec();

  const mapped = mapUserPublic({
    ...user,
    roleLabel,
    id: String(user._id),
  })!;

  const token = createSessionToken({
    userId: mapped.id,
    name: mapped.name,
    email: mapped.email,
    role: mapped.role,
    roleLabel: mapped.roleLabel,
    branchId: mapped.branchId,
    branchName: mapped.branchName,
  });

  const res = NextResponse.json({
    ok: true,
    user: mapped,
    permissions: permissionsForRole(mapped.role),
  });
  applySessionCookie(res, token);
  return res;
}

/** POST /api/auth/login — email + password → session cookie (≤3s budget). */
export async function POST(req: Request) {
  try {
    return await withAuthTimeout(loginHandler(req), "Login", AUTH_TIMEOUT_MS);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Login failed";
    const timedOut = /too long/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: timedOut ? 504 : 500 },
    );
  }
}

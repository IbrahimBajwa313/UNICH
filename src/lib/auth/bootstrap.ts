import { connectDB } from "@/lib/db";
import { Branch, User } from "@/lib/models";
import { hashPassword } from "@/lib/auth/password";
import { ROLE_LABELS } from "@/lib/auth/roles";

/**
 * Ensure at least one branch + admin user exist (BRN-08 bootstrap).
 * Uses ADMIN_EMAIL / ADMIN_PASSWORD from env when seeding the first admin.
 */
export async function ensureAuthBootstrap(): Promise<void> {
  await connectDB();

  let branch = await Branch.findOne({ code: "MAIN" });
  if (!branch) {
    branch = await Branch.create({
      name: "Main Store — Dubai",
      code: "MAIN",
      active: true,
    });
  }

  const userCount = await User.countDocuments();
  if (userCount > 0) return;

  const email = (
    process.env.ADMIN_EMAIL ||
    process.env.admin_email ||
    "admin@unich.local"
  )
    .trim()
    .toLowerCase();
  const password =
    process.env.ADMIN_PASSWORD ||
    process.env.FORMULA_ADMIN_PASSWORD ||
    process.env.IMPORT_ADMIN_PASSWORD ||
    "admin";

  const name =
    process.env.ADMIN_NAME?.trim() ||
    email.split("@")[0] ||
    "Admin";

  await User.create({
    name,
    email,
    passwordHash: hashPassword(password),
    role: "super_admin",
    roleLabel: ROLE_LABELS.super_admin,
    branchId: branch._id,
    branchName: branch.name,
    active: true,
  });
}

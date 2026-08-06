import { ensureAuthBootstrap } from "../src/lib/auth/bootstrap";
import { connectDB } from "../src/lib/db";
import { Branch, User } from "../src/lib/models";
import { hashPassword } from "../src/lib/auth/password";
import { ROLE_LABELS } from "../src/lib/auth/roles";
import mongoose from "mongoose";

async function main() {
  await ensureAuthBootstrap();
  await connectDB();

  const branch = await Branch.findOne({ code: "MAIN" });
  if (!branch) throw new Error("MAIN branch missing");

  const demos = [
    {
      name: "Sales Demo",
      email: "sales@unich.local",
      password: "sales123",
      role: "sales" as const,
    },
    {
      name: "Accountant Demo",
      email: "accounts@unich.local",
      password: "accounts123",
      role: "accountant" as const,
    },
    {
      name: "Admin Demo",
      email: "admin@unich.local",
      password: "admin123",
      role: "admin" as const,
    },
  ];

  for (const d of demos) {
    const existing = await User.findOne({ email: d.email });
    if (existing) {
      console.log("exists:", d.email);
      continue;
    }
    await User.create({
      name: d.name,
      email: d.email,
      passwordHash: hashPassword(d.password),
      role: d.role,
      roleLabel: ROLE_LABELS[d.role],
      branchId: branch._id,
      branchName: branch.name,
      active: true,
    });
    console.log("created:", d.email);
  }

  const users = await User.find()
    .select("name email role roleLabel branchName active")
    .lean();
  console.log(
    "Users:",
    users.map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      branch: u.branchName,
    })),
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

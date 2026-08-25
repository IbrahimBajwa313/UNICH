import type { AppUser, UserRole } from "@/lib/types";
import { toJSON } from "@/lib/serialize";

type UserDoc = {
  _id?: unknown;
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  branchId?: unknown;
  branchName?: string | null;
  active: boolean;
  lastLoginAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  passwordHash?: string;
};

export function mapUserPublic(doc: UserDoc | null | undefined): AppUser | null {
  if (!doc) return null;
  const json = toJSON(doc as Record<string, unknown>) as Record<string, unknown>;
  delete json.passwordHash;
  return {
    id: String(json.id),
    name: String(json.name || ""),
    email: String(json.email || "").toLowerCase(),
    role: json.role as UserRole,
    roleLabel: String(json.roleLabel || json.role),
    branchId: json.branchId ? String(json.branchId) : null,
    branchName: json.branchName ? String(json.branchName) : null,
    active: json.active !== false,
    lastLoginAt: json.lastLoginAt
      ? new Date(json.lastLoginAt as string | Date).toISOString()
      : null,
    createdAt: json.createdAt
      ? new Date(json.createdAt as string | Date).toISOString()
      : undefined,
    updatedAt: json.updatedAt
      ? new Date(json.updatedAt as string | Date).toISOString()
      : undefined,
  };
}

import { canAccessAllBranches } from "@/lib/auth/roles";
import type { AppSession } from "@/lib/auth/session";
import type { UserRole } from "@/lib/types";
import type { ReportCategory } from "./types";

/**
 * Category-level access, kept separate from `ROLE_PERMISSIONS` in
 * `@/lib/auth/roles` on purpose — the base `reports:read` permission there
 * still gates the whole `/api/reports/*` surface (unchanged); this map adds
 * a second, finer gate so e.g. Cashier/Inventory don't see profit or
 * finance data just because they can view reports at all.
 */
const ROLE_REPORT_CATEGORIES: Record<UserRole, ReportCategory[]> = {
  owner: [
    "sales",
    "inventory",
    "profit",
    "purchase",
    "customer",
    "finance",
    "production",
    "hr",
    "branch",
  ],
  manager: [
    "sales",
    "inventory",
    "profit",
    "purchase",
    "customer",
    "finance",
    "production",
    "hr",
  ],
  accountant: ["sales", "purchase", "profit", "finance", "customer"],
  inventory: ["inventory", "production"],
  cashier: ["sales", "customer"],
  branch_manager: [
    "sales",
    "inventory",
    "profit",
    "purchase",
    "customer",
    "finance",
    "production",
  ],
};

export function reportCategoriesForRole(role: UserRole): ReportCategory[] {
  return ROLE_REPORT_CATEGORIES[role] ?? [];
}

export function canAccessReportCategory(
  role: UserRole,
  category: ReportCategory,
): boolean {
  return reportCategoriesForRole(role).includes(category);
}

/**
 * Resolve which branch a request may see: all-branch roles keep the
 * requested branch (or none = every branch); everyone else is pinned to
 * their own session branch regardless of what the client asked for.
 */
export function resolveBranchScope(
  session: AppSession,
  requestedBranchId: string | null,
): string | null {
  if (canAccessAllBranches(session.role)) {
    return requestedBranchId;
  }
  return session.branchId;
}

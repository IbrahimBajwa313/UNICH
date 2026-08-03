import type { FormulaAuditAction, FormulaStatus } from "@/lib/types";

export function mapFormula(f: Record<string, unknown>) {
  const versions = Array.isArray(f.versions)
    ? (f.versions as Record<string, unknown>[]).map((v) => ({
        ...v,
        customerId: v.customerId ? String(v.customerId) : undefined,
        savedAt: v.savedAt
          ? new Date(v.savedAt as string).toISOString().slice(0, 10)
          : undefined,
      }))
    : [];

  const history = Array.isArray(f.history)
    ? (f.history as Record<string, unknown>[]).map((h) => ({
        ...h,
        at: h.at
          ? new Date(h.at as string).toISOString().replace("T", " ").slice(0, 16)
          : undefined,
      }))
    : [];

  return {
    ...f,
    status: (f.status as string) || "draft",
    version: typeof f.version === "number" ? f.version : 1,
    versions,
    history,
    customerId: f.customerId ? String(f.customerId) : undefined,
    approvedAt: f.approvedAt
      ? new Date(f.approvedAt as string).toISOString().slice(0, 10)
      : undefined,
    updatedAt: f.updatedAt
      ? new Date(f.updatedAt as string).toISOString().slice(0, 10)
      : undefined,
  };
}

export function makeAuditEntry(input: {
  action: FormulaAuditAction;
  by?: string;
  detail?: string;
  fromStatus?: FormulaStatus | string;
  toStatus?: FormulaStatus | string;
  fromVersion?: number;
  toVersion?: number;
}) {
  return {
    at: new Date(),
    by: input.by || "Admin",
    action: input.action,
    detail: input.detail,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
  };
}

import { OIL_BASE_PRODUCT_ID } from "@/lib/sales/constants";
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

  const reservation = f.materialsReservation as
    | {
        active?: boolean;
        reservedAt?: string | Date;
        lines?: unknown[];
      }
    | undefined;

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
    materialsReservation: reservation
      ? {
          active: Boolean(reservation.active),
          reservedAt: reservation.reservedAt
            ? new Date(reservation.reservedAt as string)
                .toISOString()
                .slice(0, 10)
            : undefined,
          lines: Array.isArray(reservation.lines) ? reservation.lines : [],
        }
      : { active: false, lines: [] },
    updatedAt: f.updatedAt
      ? new Date(f.updatedAt as string).toISOString().slice(0, 10)
      : undefined,
  };
}

/**
 * BLD-04: non-admin may not view recipe components / history / notes.
 * POS still gets reuseHints so repeat orders work without exposing BOM.
 */
export function mapFormulaPublic(f: Record<string, unknown>) {
  const full = mapFormula(f);
  const components = Array.isArray(f.components)
    ? (f.components as Array<{
        productId?: string;
        productName?: string;
        unit?: string;
      }>)
    : [];

  const hasOilBase = components.some(
    (c) => String(c.productId || "") === OIL_BASE_PRODUCT_ID,
  );
  let oilProductId: string | undefined;
  let oilProductName: string | undefined;
  if (!hasOilBase) {
    const oilComp = components.find(
      (c) =>
        String(c.productId || "") !== OIL_BASE_PRODUCT_ID && c.unit === "ml",
    );
    if (oilComp?.productId) {
      oilProductId = String(oilComp.productId);
      oilProductName = oilComp.productName;
    }
  }

  const row = full as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: full.status,
    version: full.version,
    customerId: full.customerId,
    customerName: row.customerName,
    yieldMl: row.yieldMl,
    updatedAt: full.updatedAt,
    /** Empty — recipe ratios hidden from non-admin. */
    components: [] as unknown[],
    versions: [] as unknown[],
    history: [] as unknown[],
    // Reservation lines leak BOM qty — hide from non-admin.
    materialsReservation: {
      active: Boolean(full.materialsReservation?.active),
      lines: [],
    },
    recipeHidden: true as const,
    reuseHints: {
      needsOilSelection: hasOilBase || !oilProductId,
      oilProductId,
      oilProductName,
    },
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

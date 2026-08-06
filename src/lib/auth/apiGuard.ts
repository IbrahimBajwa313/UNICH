import { NextResponse } from "next/server";
import {
  isAuthResponse,
  requireAuth,
  requirePermission,
} from "@/lib/auth/guards";
import {
  ALL_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  permissionForApiPath,
  type Permission,
} from "@/lib/auth/roles";
import type { AppSession } from "@/lib/auth/session";

function deny(message: string, status = 403) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Enforce session + path permission for an API request.
 * Returns `null` when the path is intentionally public (caller continues).
 */
export function requireApiAccess(
  req: Request,
  pathname?: string,
): AppSession | NextResponse | null {
  const url = new URL(req.url);
  const path = pathname || url.pathname;

  if (
    path === "/api/health" ||
    path === "/api/auth/login" ||
    path === "/api/auth/logout" ||
    path.startsWith("/api/auth/formula-admin") ||
    path === "/api/auth/me"
  ) {
    return null;
  }

  const auth = requireAuth(req);
  if (isAuthResponse(auth)) return auth;

  const method = req.method.toUpperCase();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);

  // Settings: any logged-in user may GET (shell needs branch defaults);
  // only settings:write may mutate.
  if (path.startsWith("/api/settings")) {
    if (mutating && !hasPermission(auth.role, "settings:write")) {
      return deny("Permission denied (settings:write).");
    }
    return auth;
  }

  // Product catalog: POS / purchases / inventory / formulas all need GET.
  if (path.startsWith("/api/products") || path.startsWith("/api/fifo-layers")) {
    if (mutating) {
      if (!hasPermission(auth.role, "inventory:write")) {
        return deny("Permission denied (inventory:write).");
      }
      return auth;
    }
    if (
      !hasAnyPermission(auth.role, [
        "inventory:read",
        "pos:read",
        "purchases:read",
        "formulas:read",
        "production:read",
      ])
    ) {
      return deny("Permission denied (product catalog).");
    }
    return auth;
  }

  // Formulas: redacted customer formulas for POS/CRM; full list Admin-only.
  // Recipe secrecy still enforced by requireFormulaAdmin on mutations / export.
  if (path.startsWith("/api/formulas")) {
    if (mutating) {
      if (!hasPermission(auth.role, "formulas:write")) {
        return deny("Permission denied (formulas:write).");
      }
      return auth;
    }
    const customerId = url.searchParams.get("customerId");
    if (customerId) {
      if (
        !hasAnyPermission(auth.role, [
          "formulas:read",
          "pos:read",
          "customers:read",
        ])
      ) {
        return deny("Permission denied (formulas).");
      }
      return auth;
    }
    if (!hasPermission(auth.role, "formulas:read")) {
      return deny("Permission denied (formulas:read).");
    }
    return auth;
  }

  // Receipts / notifications tied to completed sales
  if (
    path.startsWith("/api/receipts") ||
    path.startsWith("/api/notifications")
  ) {
    if (
      !hasAnyPermission(auth.role, [
        "pos:read",
        "pos:write",
        "reports:read",
        "settings:read",
      ])
    ) {
      return deny("Permission denied.");
    }
    return auth;
  }

  // Dashboard
  if (path.startsWith("/api/dashboard")) {
    if (!hasPermission(auth.role, "dashboard:read")) {
      return deny("Permission denied (dashboard:read).");
    }
    return auth;
  }

  const base = permissionForApiPath(path);
  if (!base) {
    return auth; // authenticated catch-all for unmapped APIs
  }

  if (mutating) {
    const writePerm = base.replace(":read", ":write") as Permission;
    if ((ALL_PERMISSIONS as string[]).includes(writePerm)) {
      if (!hasPermission(auth.role, writePerm)) {
        return deny(`Permission denied (${writePerm}).`);
      }
      return auth;
    }
  }

  if (!hasPermission(auth.role, base)) {
    return deny(`Permission denied (${base}).`);
  }
  return auth;
}

export { isAuthResponse, requirePermission, requireAuth };

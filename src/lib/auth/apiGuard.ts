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

const DB_CONNECTION_ERROR_NAMES = new Set([
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
  "MongoTimeoutError",
]);

/**
 * Never leak raw Mongo/driver error text (can include internal file paths,
 * connection strings) to API clients. Everything else still surfaces its
 * own message so callers get actionable validation/business errors.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && DB_CONNECTION_ERROR_NAMES.has(error.name)) {
    if (process.env.NODE_ENV !== "production") {
      return `${fallback} — DB connection error (dev only): ${error.name}: ${error.message}`;
    }
    return "Something went wrong. Please try again later.";
  }
  return error instanceof Error ? error.message : fallback;
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
    path === "/api/auth/me" ||
    // QTN-10: customer approval link — reachable only with the unguessable token itself.
    path.startsWith("/api/quotations/public/")
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

  // Header notification bell — same audience as the dashboard it mirrors.
  if (path.startsWith("/api/notifications")) {
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

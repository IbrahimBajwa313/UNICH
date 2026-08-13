import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { applyCorsHeaders, corsPreflightResponse } from "@/lib/cors";

/**
 * Optimistic route gate (Next.js 16 proxy).
 * Authoritative checks live in API handlers via requireApiAccess / requirePermission.
 * CORS for /api/* is applied here so preflight + credentialed clients work.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (isApi) {
    const preflight = corsPreflightResponse(request);
    if (preflight) return preflight;
  }

  const withCors = (res: NextResponse) =>
    isApi ? applyCorsHeaders(res, request) : res;

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isPublicApi =
    pathname === "/api/health" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/me" ||
    pathname.startsWith("/api/auth/formula-admin");

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (isPublicApi) {
    return withCors(NextResponse.next());
  }

  if (isLogin) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // App pages + protected APIs: require cookie presence
  if (!hasSession) {
    if (isApi) {
      return withCors(
        NextResponse.json(
          { error: "Authentication required. Please sign in." },
          { status: 401 },
        ),
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return withCors(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

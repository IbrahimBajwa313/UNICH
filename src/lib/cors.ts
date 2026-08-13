import { NextResponse } from "next/server";

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const ALLOW_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "Idempotency-Key",
  "X-Formula-Admin-Email",
  "X-Formula-Admin-Password",
  "X-Formula-Admin-Name",
  "X-Admin-Email",
  "X-Admin-Password",
  "X-Admin-Name",
].join(", ");

/** Origins allowed for cross-origin API calls (credentials supported). */
export function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const extras = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]
    .map((s) => (s || "").trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv, ...extras])];
}

export function resolveCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowed = getAllowedOrigins();
  // Reflect request origin when list contains "*" (never send literal "*"
  // with credentials).
  if (allowed.includes("*") || allowed.includes(origin)) {
    return origin;
  }
  return null;
}

export function applyCorsHeaders(
  response: NextResponse,
  request: Request,
): NextResponse {
  const origin = resolveCorsOrigin(request);
  if (!origin) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
  response.headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.append("Vary", "Origin");
  return response;
}

/** Short-circuit browser preflight for /api/*. */
export function corsPreflightResponse(request: Request): NextResponse | null {
  if (request.method !== "OPTIONS") return null;

  const origin = resolveCorsOrigin(request);
  if (!origin) {
    return new NextResponse(null, { status: 403 });
  }

  const res = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(res, request);
}

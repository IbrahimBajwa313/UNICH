import { NextResponse } from "next/server";
import { clearSessionCookieHeader } from "@/lib/auth/session";

/** POST /api/auth/logout — clear session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookieHeader());
  return res;
}

export async function DELETE() {
  return POST();
}

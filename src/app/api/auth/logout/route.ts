import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

/** POST /api/auth/logout — clear session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}

export async function DELETE() {
  return POST();
}

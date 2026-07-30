import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Connection failed",
      },
      { status: 500 },
    );
  }
}

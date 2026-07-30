import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AppSettings } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

export async function GET() {
  try {
    await connectDB();
    let settings = await AppSettings.findOne({ key: "default" });
    if (!settings) {
      settings = await AppSettings.create({ key: "default" });
    }
    return NextResponse.json(toJSON(settings));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const settings = await AppSettings.findOneAndUpdate(
      { key: "default" },
      { $set: body },
      { returnDocument: "after", upsert: true, runValidators: true },
    );
    return NextResponse.json(toJSON(settings));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 400 },
    );
  }
}

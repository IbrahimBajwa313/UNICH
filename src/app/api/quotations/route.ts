import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

function mapQuote(q: Record<string, unknown>) {
  return {
    ...q,
    date: q.date ? new Date(q.date as string).toISOString().slice(0, 10) : null,
    expiry: q.expiry
      ? new Date(q.expiry as string).toISOString().slice(0, 10)
      : null,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const filter = status && status !== "all" ? { status } : {};
    const quotations = await Quotation.find(filter).sort({ date: -1 });
    return NextResponse.json(toJSONList(quotations).map(mapQuote));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load quotations" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const count = await Quotation.countDocuments();
    const number =
      body.number ||
      `QT-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
    const quotation = await Quotation.create({
      ...body,
      number,
      date: new Date(body.date || Date.now()),
      expiry: new Date(
        body.expiry || Date.now() + 14 * 24 * 60 * 60 * 1000,
      ),
      status: body.status || "draft",
    });
    return NextResponse.json(mapQuote(toJSON(quotation)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quotation" },
      { status: 400 },
    );
  }
}

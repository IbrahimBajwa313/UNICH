import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Formula } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

function mapFormula(f: Record<string, unknown>) {
  return {
    ...f,
    customerId: f.customerId ? String(f.customerId) : undefined,
    updatedAt: f.updatedAt
      ? new Date(f.updatedAt as string).toISOString().slice(0, 10)
      : undefined,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const filter = customerId ? { customerId } : {};
    const formulas = await Formula.find(filter).sort({ updatedAt: -1 });
    return NextResponse.json(toJSONList(formulas).map(mapFormula));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load formulas" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const formula = await Formula.create(body);
    return NextResponse.json(mapFormula(toJSON(formula)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create formula" },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Customer } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

function mapCustomer(c: Record<string, unknown>) {
  return {
    ...c,
    lastVisit: c.lastVisit
      ? new Date(c.lastVisit as string).toISOString().slice(0, 10)
      : null,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const filter: Record<string, unknown> = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
      ];
    }
    const customers = await Customer.find(filter).sort({ name: 1 });
    return NextResponse.json(toJSONList(customers).map(mapCustomer));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load customers" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const customer = await Customer.create({
      ...body,
      lastVisit: body.lastVisit ? new Date(body.lastVisit) : new Date(),
    });
    return NextResponse.json(mapCustomer(toJSON(customer)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create customer" },
      { status: 400 },
    );
  }
}

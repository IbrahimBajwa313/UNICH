import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Customer } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const customer = await Customer.findById(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    const json = toJSON(customer)!;
    return NextResponse.json({
      ...json,
      lastVisit: json.lastVisit
        ? new Date(json.lastVisit as string).toISOString().slice(0, 10)
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load customer" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.lastVisit) body.lastVisit = new Date(body.lastVisit);
    const customer = await Customer.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(toJSON(customer));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update customer" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const customer = await Customer.findByIdAndDelete(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete customer" },
      { status: 500 },
    );
  }
}

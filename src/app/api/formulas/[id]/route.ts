import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Formula } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();
    const formula = await Formula.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!formula) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 });
    }
    return NextResponse.json(toJSON(formula));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update formula" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const formula = await Formula.findByIdAndDelete(id);
    if (!formula) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete formula" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Supplier } from "@/lib/models";
import { toJSON } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.lastPurchase) body.lastPurchase = new Date(body.lastPurchase);
    const supplier = await Supplier.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }
    return NextResponse.json(toJSON(supplier));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update supplier" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { id } = await ctx.params;
    const supplier = await Supplier.findByIdAndDelete(id);
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete supplier" },
      { status: 500 },
    );
  }
}

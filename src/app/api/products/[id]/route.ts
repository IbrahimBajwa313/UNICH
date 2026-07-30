import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { FifoLayer, Product } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const product = await Product.findById(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(toJSON(product));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load product" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();
    const product = await Product.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(toJSON(product));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update product" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    await FifoLayer.deleteMany({ productId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete product" },
      { status: 500 },
    );
  }
}

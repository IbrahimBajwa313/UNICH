import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const category = searchParams.get("category");
    const filter: Record<string, unknown> = {};
    if (category && category !== "All") filter.category = category;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { sku: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
      ];
    }
    const products = await Product.find(filter).sort({ name: 1 });
    return NextResponse.json(toJSONList(products));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load products" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const product = await Product.create(body);
    return NextResponse.json(toJSON(product), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create product" },
      { status: 400 },
    );
  }
}

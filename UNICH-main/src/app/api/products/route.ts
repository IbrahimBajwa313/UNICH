import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { defaultLowStockAt } from "@/lib/inventory/stockCheck";
import { Product } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess, safeErrorMessage } from "@/lib/auth/apiGuard";
import { canViewCostPrices, redactCostFields } from "@/lib/auth/roles";

const COST_FIELDS = ["wholesalePrice", "costFifo", "minMarginPct"];

export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

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
    const products = await Product.find(filter).sort({ name: 1 }).lean();
    let list = toJSONList(products);
    if (access && !canViewCostPrices(access.role)) {
      list = list.map((p) => redactCostFields(p, COST_FIELDS));
    }
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to load products") },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const body = await req.json();
    // ALT-01: apply default low-stock thresholds when omitted
    if (
      body.lowStockAt === undefined ||
      body.lowStockAt === null ||
      body.lowStockAt === ""
    ) {
      body.lowStockAt = defaultLowStockAt({
        unit: String(body.unit || "pcs"),
        category: body.category,
        itemType: body.itemType,
        name: body.name,
      });
    }
    const product = await Product.create(body);
    return NextResponse.json(toJSON(product), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to create product") },
      { status: 400 },
    );
  }
}

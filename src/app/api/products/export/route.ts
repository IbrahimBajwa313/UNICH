import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { buildCatalogueExport } from "@/lib/excel/template";
import { Product } from "@/lib/models";
import { toJSONList } from "@/lib/serialize";
import type { Product as ProductType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectDB();
    const products = await Product.find().sort({ name: 1 });
    const list = toJSONList(products) as ProductType[];
    const buffer = buildCatalogueExport(list);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="unich-product-catalogue.xlsx"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export products" },
      { status: 500 },
    );
  }
}

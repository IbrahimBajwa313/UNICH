import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { makeAuditEntry, mapFormula } from "@/lib/formulas/mapFormula";
import { validateFormulaInput } from "@/lib/formulas/validateFormula";
import { Formula } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim() || searchParams.get("search")?.trim();
    const filter: Record<string, unknown> = {};

    if (customerId) filter.customerId = customerId;
    if (status) filter.status = status;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { customerName: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
        { type: { $regex: q, $options: "i" } },
      ];
    }

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
    const errors = validateFormulaInput({
      name: body.name,
      type: body.type,
      yieldMl: body.yieldMl,
      components: body.components,
    });
    if (errors.length) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const by = (body.savedBy as string) || (body.approvedBy as string) || "Admin";
    const formula = await Formula.create({
      ...body,
      status: "draft",
      version: 1,
      versions: [],
      history: [
        makeAuditEntry({
          action: "created",
          by,
          detail: "Formula created as draft",
          toStatus: "draft",
          toVersion: 1,
        }),
      ],
      approvedAt: undefined,
      approvedBy: undefined,
    });
    return NextResponse.json(mapFormula(toJSON(formula)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create formula" },
      { status: 400 },
    );
  }
}

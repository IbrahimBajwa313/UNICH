import { NextResponse } from "next/server";
import {
  getFormulaAdmin,
  isFormulaAdminResponse,
  requireFormulaAdmin,
} from "@/lib/auth/formulaAdmin";
import { connectDB } from "@/lib/db";
import {
  makeAuditEntry,
  mapFormula,
  mapFormulaPublic,
} from "@/lib/formulas/mapFormula";
import { validateFormulaInput } from "@/lib/formulas/validateFormula";
import { Formula } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";
import { isAuthResponse, requireApiAccess } from "@/lib/auth/apiGuard";

/**
 * GET formulas.
 * - Admin session: full recipes (BLD-04 view).
 * - Non-admin: customer-scoped list only, components redacted (POS / customers).
 */
export async function GET(req: Request) {
  try {
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    await connectDB();
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim() || searchParams.get("search")?.trim();
    const admin = getFormulaAdmin(req);

    if (!admin) {
      // Public/POS/customers path: customer-scoped only, recipe ratios redacted.
      // Library-wide list / search still requires admin (BLD-04 view).
      if (!customerId) {
        return NextResponse.json(
          {
            error:
              "Admin access required to view formulas (BLD-04). Unlock with admin password.",
          },
          { status: 403 },
        );
      }
      const publicFilter: Record<string, unknown> = { customerId };
      if (status) publicFilter.status = status;
      const formulas = await Formula.find(publicFilter)
        .sort({ updatedAt: -1 })
        .lean();
      return NextResponse.json(toJSONList(formulas).map(mapFormulaPublic));
    }

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

    const formulas = await Formula.find(filter).sort({ updatedAt: -1 }).lean();
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
    const access = requireApiAccess(req);
    if (access !== null && isAuthResponse(access)) return access;

    const admin = requireFormulaAdmin(req);
    if (isFormulaAdminResponse(admin)) return admin;

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

    const by = admin.name;
    const formula = await Formula.create({
      ...body,
      status: "draft",
      version: 1,
      versions: [],
      materialsReservation: { active: false, lines: [] },
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

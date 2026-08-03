import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { makeAuditEntry, mapFormula } from "@/lib/formulas/mapFormula";
import { validateFormulaInput } from "@/lib/formulas/validateFormula";
import { Formula } from "@/lib/models";
import { toJSON } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

type FormulaStatus = "draft" | "approved" | "rejected" | "archived";

function isContentTouched(body: Record<string, unknown>) {
  return (
    body.name !== undefined ||
    body.type !== undefined ||
    body.yieldMl !== undefined ||
    body.components !== undefined ||
    body.notes !== undefined ||
    body.customerId !== undefined ||
    body.customerName !== undefined
  );
}

function snapshotFromDoc(doc: Record<string, unknown>, savedBy?: string) {
  return {
    version: typeof doc.version === "number" ? doc.version : 1,
    name: doc.name,
    type: doc.type,
    status: (doc.status as string) || "draft",
    customerId: doc.customerId,
    customerName: doc.customerName,
    yieldMl: doc.yieldMl,
    components: doc.components,
    notes: doc.notes,
    savedAt: new Date(),
    savedBy: savedBy || "Admin",
  };
}

function currentVersion(doc: Record<string, unknown>) {
  return typeof doc.version === "number" ? doc.version : 1;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;
    const nextStatus = body.status as FormulaStatus | undefined;
    const contentTouched = isContentTouched(body);
    const restoreVersion =
      typeof body.restoreVersion === "number" ? body.restoreVersion : undefined;
    const savedBy =
      (body.savedBy as string) || (body.approvedBy as string) || "Admin";

    // Restore a prior revision into the live recipe (creates a new version).
    if (restoreVersion !== undefined) {
      const current = await Formula.findById(id).lean<Record<string, unknown>>();
      if (!current) {
        return NextResponse.json({ error: "Formula not found" }, { status: 404 });
      }
      const history = Array.isArray(current.versions)
        ? (current.versions as Record<string, unknown>[])
        : [];
      const snap = history.find((v) => v.version === restoreVersion);
      if (!snap) {
        return NextResponse.json(
          { error: `Version ${restoreVersion} not found` },
          { status: 404 },
        );
      }

      const fromVersion = currentVersion(current);
      const toVersion = fromVersion + 1;
      const formula = await Formula.findByIdAndUpdate(
        id,
        {
          $push: {
            versions: snapshotFromDoc(current, savedBy),
            history: makeAuditEntry({
              action: "restored",
              by: savedBy,
              detail: `Restored recipe from v${restoreVersion}`,
              fromStatus: current.status as string,
              toStatus: "draft",
              fromVersion,
              toVersion,
            }),
          },
          $set: {
            name: snap.name,
            type: snap.type,
            yieldMl: snap.yieldMl,
            components: snap.components,
            notes: snap.notes,
            customerId: snap.customerId,
            customerName: snap.customerName,
            status: "draft",
            version: toVersion,
          },
          $unset: { approvedAt: "", approvedBy: "" },
        },
        { returnDocument: "after", runValidators: true },
      );
      if (!formula) {
        return NextResponse.json({ error: "Formula not found" }, { status: 404 });
      }
      return NextResponse.json(mapFormula(toJSON(formula)!));
    }

    // Fast path: status-only (approve / reject / revoke / archive).
    if (nextStatus && !contentTouched) {
      const current = await Formula.findById(id).lean<Record<string, unknown>>();
      if (!current) {
        return NextResponse.json({ error: "Formula not found" }, { status: 404 });
      }

      const update =
        nextStatus === "approved"
          ? {
              $set: {
                status: "approved",
                approvedAt: new Date(),
                approvedBy: (body.approvedBy as string) || "Admin",
              },
              $push: {
                history: makeAuditEntry({
                  action: "status_changed",
                  by: savedBy,
                  detail: `Status → approved`,
                  fromStatus: current.status as string,
                  toStatus: "approved",
                  fromVersion: currentVersion(current),
                  toVersion: currentVersion(current),
                }),
              },
            }
          : {
              $set: { status: nextStatus },
              $unset: { approvedAt: "", approvedBy: "" },
              $push: {
                history: makeAuditEntry({
                  action: "status_changed",
                  by: savedBy,
                  detail: `Status → ${nextStatus}`,
                  fromStatus: current.status as string,
                  toStatus: nextStatus,
                  fromVersion: currentVersion(current),
                  toVersion: currentVersion(current),
                }),
              },
            };

      const formula = await Formula.findByIdAndUpdate(id, update, {
        returnDocument: "after",
      });
      if (!formula) {
        return NextResponse.json({ error: "Formula not found" }, { status: 404 });
      }
      return NextResponse.json(mapFormula(toJSON(formula)!));
    }

    // Content edit: one Atlas round-trip — snapshot + bump + audit via pipeline.
    const nextName = typeof body.name === "string" ? body.name : undefined;
    const nextType = typeof body.type === "string" ? body.type : undefined;
    const nextYield =
      body.yieldMl !== undefined ? Number(body.yieldMl) : undefined;
    const nextComponents = Array.isArray(body.components)
      ? body.components
      : undefined;

    // Validate with provided fields; missing fields are filled from DB in the pipeline
    // only when all content fields are present (client always sends full recipe on save).
    if (
      nextName === undefined ||
      nextType === undefined ||
      nextYield === undefined ||
      nextComponents === undefined
    ) {
      return NextResponse.json(
        { error: "name, type, yieldMl, and components are required when editing" },
        { status: 400 },
      );
    }

    const errors = validateFormulaInput({
      name: nextName,
      type: nextType,
      yieldMl: nextYield,
      components: nextComponents as never,
    });
    if (errors.length) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const toStatus: FormulaStatus =
      nextStatus === "approved" ||
      nextStatus === "rejected" ||
      nextStatus === "archived" ||
      nextStatus === "draft"
        ? nextStatus
        : "draft";
    const now = new Date();
    const setFields: Record<string, unknown> = {
      versions: {
        $concatArrays: [
          { $ifNull: ["$versions", []] },
          [
            {
              version: { $ifNull: ["$version", 1] },
              name: "$name",
              type: "$type",
              status: { $ifNull: ["$status", "draft"] },
              customerId: "$customerId",
              customerName: "$customerName",
              yieldMl: "$yieldMl",
              components: "$components",
              notes: "$notes",
              savedAt: now,
              savedBy,
            },
          ],
        ],
      },
      history: {
        $concatArrays: [
          { $ifNull: ["$history", []] },
          [
            {
              at: now,
              by: savedBy,
              action: "updated",
              detail: {
                $concat: [
                  "Recipe edited → v",
                  {
                    $toString: {
                      $add: [{ $ifNull: ["$version", 1] }, 1],
                    },
                  },
                ],
              },
              fromStatus: "$status",
              toStatus,
              fromVersion: { $ifNull: ["$version", 1] },
              toVersion: { $add: [{ $ifNull: ["$version", 1] }, 1] },
            },
          ],
        ],
      },
      name: nextName,
      type: nextType,
      yieldMl: nextYield,
      components: nextComponents,
      status: toStatus,
      version: { $add: [{ $ifNull: ["$version", 1] }, 1] },
    };

    if (body.notes !== undefined) setFields.notes = body.notes;
    if (body.customerId !== undefined) setFields.customerId = body.customerId;
    if (body.customerName !== undefined) {
      setFields.customerName = body.customerName;
    }

    const pipeline: Record<string, unknown>[] = [{ $set: setFields }];
    if (toStatus === "approved") {
      pipeline.push({
        $set: {
          approvedAt: now,
          approvedBy: (body.approvedBy as string) || "Admin",
        },
      });
    } else {
      pipeline.push({ $unset: ["approvedAt", "approvedBy"] });
    }

    const formula = await Formula.findOneAndUpdate({ _id: id }, pipeline, {
      returnDocument: "after",
      updatePipeline: true,
    });
    if (!formula) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 });
    }
    return NextResponse.json(mapFormula(toJSON(formula)!));
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

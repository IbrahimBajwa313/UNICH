import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import {
  deductFifo,
  refreshCostFifo,
  restoreFifo,
  type DeductFifoResult,
} from "@/lib/inventory";
import { AppSettings, Customer, Sale } from "@/lib/models";
import { SaleError } from "@/lib/sales/errors";
import {
  validateSaleLines,
  type IncomingSaleLine,
  type ValidatedSaleLine,
} from "@/lib/sales/validateSale";

export type DeductionAuditEntry = {
  productId: string;
  productName: string;
  qty: number;
  reason: string;
  lineIndex: number;
  batches: Array<{
    layerId: string;
    qty: number;
    unitCost: number;
    purchaseDate: Date;
  }>;
  costTotal: number;
};

export type CreateSaleInput = {
  customerPhone: string;
  customerName?: string;
  salesperson?: string;
  payment: string;
  lines: IncomingSaleLine[];
  status?: "completed" | "held" | "void";
  idempotencyKey?: string;
};

/** Cache whether this Mongo deployment supports multi-doc transactions. */
let transactionsSupported: boolean | null = null;

async function resolveSalesperson(value?: string) {
  const settings = await AppSettings.findOne({ key: "default" })
    .select("salespeople currentUserName activeSalesperson")
    .lean();
  const configured = Array.isArray(settings?.salespeople)
    ? settings.salespeople
        .map((name: unknown) => String(name).trim())
        .filter(Boolean)
    : [];
  const fallback = String(settings?.currentUserName || "Ahmad Ibrahim").trim();
  const salespeople = configured.length > 0 ? configured : [fallback];

  // Always prefer Settings → Active Salesperson (POS cannot freely reassign)
  const active = String(
    (settings as { activeSalesperson?: string } | null)?.activeSalesperson || "",
  ).trim();
  const activeMatch = salespeople.find(
    (name: string) => name.toLowerCase() === active.toLowerCase(),
  );
  if (activeMatch) return activeMatch;

  const requested = value?.trim();
  if (requested) {
    const matched = salespeople.find(
      (name: string) => name.toLowerCase() === requested.toLowerCase(),
    );
    if (matched) return matched;
  }

  if (salespeople[0]) return salespeople[0];
  throw new SaleError("VALIDATION", "Set an active salesperson in Settings");
}

function isTxnUnsupported(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Transaction numbers are only allowed") ||
    msg.includes("replica set") ||
    msg.includes("transactions are not supported")
  );
}

/** Collapse same-product deductions into one FIFO consume (fewer Atlas RTTs). */
function coalesceDeductions(
  deductions: Awaited<ReturnType<typeof validateSaleLines>>["deductions"],
) {
  const map = new Map<
    string,
    {
      productId: string;
      productName: string;
      qty: number;
      reason: string;
      lineIndex: number;
    }
  >();
  for (const need of deductions) {
    const cur = map.get(need.productId);
    if (cur) {
      cur.qty += need.qty;
      cur.reason = `${cur.reason}+${need.reason}`;
    } else {
      map.set(need.productId, { ...need });
    }
  }
  return [...map.values()];
}

async function applyDeductions(
  deductions: Awaited<ReturnType<typeof validateSaleLines>>["deductions"],
  session: mongoose.ClientSession | null,
): Promise<DeductionAuditEntry[]> {
  const audit: DeductionAuditEntry[] = [];
  const applied: Array<{ productId: string; result: DeductFifoResult }> = [];
  const coalesced = coalesceDeductions(deductions);

  try {
    for (const need of coalesced) {
      const result = await deductFifo(need.productId, need.qty, {
        session,
        skipCostUpdate: true,
      });
      applied.push({ productId: need.productId, result });
      audit.push({
        productId: need.productId,
        productName: need.productName,
        qty: need.qty,
        reason: need.reason,
        lineIndex: need.lineIndex,
        batches: result.batches,
        costTotal: result.costTotal,
      });
    }
    return audit;
  } catch (err) {
    if (!session) {
      for (const a of applied.reverse()) {
        await restoreFifo(a.productId, a.result, { skipCostUpdate: true });
      }
    }
    throw err;
  }
}

async function createSaleDocument(
  input: {
    customerPhone: string;
    customerName: string;
    customerId: mongoose.Types.ObjectId;
    salesperson: string;
    payment: string;
    status: string;
    lines: ValidatedSaleLine[];
    subtotal: number;
    saleType: string;
    idempotencyKey?: string;
    inventoryDeductions: DeductionAuditEntry[];
  },
  session: mongoose.ClientSession | null,
) {
  const docs = await Sale.create(
    [
      {
        customerPhone: input.customerPhone,
        customerName: input.customerName,
        customerId: input.customerId,
        salesperson: input.salesperson,
        payment: input.payment,
        status: input.status,
        lines: input.lines,
        subtotal: input.subtotal,
        total: input.subtotal,
        saleType: input.saleType,
        idempotencyKey: input.idempotencyKey,
        inventoryDeductions: input.inventoryDeductions,
      },
    ],
    session ? { session } : undefined,
  );
  return docs[0];
}

function resolveSaleType(lines: ValidatedSaleLine[]) {
  const types = new Set(lines.map((l) => l.lineType));
  if (types.has("remix")) return "Remix";
  if (types.has("oil")) return "Oil";
  if (types.has("refill")) return "Refill";
  if (types.has("wholesale")) return "Wholesale";
  if (types.size > 1) return "Mixed";
  return "Retail";
}

const HELD_LINE_TYPES = new Set([
  "ready",
  "remix",
  "oil",
  "refill",
  "packaging",
  "wholesale",
]);

/**
 * Fast path for POS hold — snapshot cart only.
 * Skips transactions, stock checks, formula/BOM validation (those run on complete).
 */
async function holdSale(input: CreateSaleInput) {
  await connectDB();
  const salesperson = await resolveSalesperson(input.salesperson);

  if (!input.customerPhone?.trim()) {
    throw new SaleError("VALIDATION", "Customer phone is required");
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new SaleError("VALIDATION", "At least one line item is required");
  }

  const phone = input.customerPhone.trim();
  const lines: ValidatedSaleLine[] = [];
  let subtotal = 0;

  for (let i = 0; i < input.lines.length; i++) {
    const raw = input.lines[i];
    const qty = Number(raw.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new SaleError("INVALID_LINE", `Invalid quantity for line ${i + 1}`);
    }
    if (!HELD_LINE_TYPES.has(raw.lineType)) {
      throw new SaleError("INVALID_LINE", `Invalid line type: ${raw.lineType}`);
    }
    const unitPrice = Number(raw.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new SaleError("INVALID_LINE", `Invalid price for line ${i + 1}`);
    }
    const name = (raw.name || "").trim() || "Item";
    const line: ValidatedSaleLine = {
      productId: raw.productId,
      name,
      qty,
      unitLabel: raw.unitLabel || "pcs",
      unitPrice,
      lineType: raw.lineType as ValidatedSaleLine["lineType"],
      bomNote: raw.bomNote,
      deductMl: raw.deductMl,
      oilProductId: raw.oilProductId,
      oilMl: raw.oilMl,
      packagingProductIds: raw.packagingProductIds,
    };
    lines.push(line);
    subtotal += qty * unitPrice;
  }

  const givenName = input.customerName?.trim();

  // `name` may only appear in one update operator, otherwise Mongo reports a path conflict.
  const customer = await Customer.findOneAndUpdate(
    { phone },
    {
      $setOnInsert: {
        phone,
        preferences: [],
        totalPurchases: 0,
        creditBalance: 0,
        ...(givenName ? {} : { name: "Walk-in Customer" }),
      },
      ...(givenName ? { $set: { name: givenName } } : {}),
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  if (!customer) {
    throw new SaleError("VALIDATION", "Could not resolve customer for hold");
  }

  const displayName = givenName || customer.name || "Walk-in Customer";

  const sale = await Sale.create({
    customerPhone: phone,
    customerName: displayName,
    customerId: customer._id,
    salesperson,
    payment: input.payment,
    status: "held",
    lines,
    subtotal,
    total: subtotal,
    saleType: resolveSaleType(lines),
    inventoryDeductions: [],
  });

  return { sale, deduplicated: false as const };
}

/**
 * Validate → deduct (transaction or compensating) → create sale.
 * Stock is enforced atomically inside deductFifo (no pre-check round-trips).
 */
export async function createSale(input: CreateSaleInput) {
  const status = input.status ?? "completed";

  // Hold is a cart snapshot — use the fast path (no txn / no BOM validation).
  if (status === "held") {
    return holdSale(input);
  }

  await connectDB();

  if (!input.customerPhone?.trim()) {
    throw new SaleError("VALIDATION", "Customer phone is required");
  }

  const phone = input.customerPhone.trim();
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;

  // Parallel: salesperson + idempotency lookup
  const [salesperson, existing] = await Promise.all([
    resolveSalesperson(input.salesperson),
    idempotencyKey
      ? Sale.findOne({ idempotencyKey })
      : Promise.resolve(null),
  ]);

  if (existing) {
    return { sale: existing, deduplicated: true as const };
  }

  const validated = await validateSaleLines(input.lines);

  const run = async (session: mongoose.ClientSession | null) => {
    let audit: DeductionAuditEntry[] = [];

    if (status === "completed" && validated.deductions.length > 0) {
      audit = await applyDeductions(validated.deductions, session);
    }

    const givenName = input.customerName?.trim();
    const inc: Record<string, number> = {};
    const set: Record<string, unknown> = {};

    if (status === "completed") {
      inc.totalPurchases = validated.subtotal;
      set.lastVisit = new Date();
      if (input.payment === "credit") {
        inc.creditBalance = validated.subtotal;
      }
    }
    if (givenName) {
      set.name = givenName;
    }

    const customer = await Customer.findOneAndUpdate(
      { phone },
      {
        $setOnInsert: {
          phone,
          preferences: [],
          totalPurchases: 0,
          creditBalance: 0,
          ...(givenName ? {} : { name: "Walk-in Customer" }),
        },
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
        ...(session ? { session } : {}),
      },
    );

    if (!customer) {
      throw new SaleError("VALIDATION", "Could not resolve customer");
    }

    const displayName = givenName || customer.name || "Walk-in";

    try {
      const sale = await createSaleDocument(
        {
          customerPhone: phone,
          customerName: displayName,
          customerId: customer._id,
          salesperson,
          payment: input.payment,
          status,
          lines: validated.lines,
          subtotal: validated.subtotal,
          saleType: resolveSaleType(validated.lines),
          idempotencyKey,
          inventoryDeductions: audit,
        },
        session,
      );
      return { sale, audit };
    } catch (err) {
      if (
        idempotencyKey &&
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: number }).code === 11000
      ) {
        const dup = await Sale.findOne({ idempotencyKey });
        if (dup) {
          // Another request won the race — reverse our deductions if we applied outside txn
          if (!session && audit.length) {
            for (const entry of audit.reverse()) {
              await restoreFifo(
                entry.productId,
                {
                  costTotal: entry.costTotal,
                  batches: entry.batches,
                },
                { skipCostUpdate: true },
              );
            }
          }
          return { sale: dup, audit: [] as DeductionAuditEntry[] };
        }
      }
      if (!session && audit.length) {
        for (const entry of audit.reverse()) {
          await restoreFifo(
            entry.productId,
            {
              costTotal: entry.costTotal,
              batches: entry.batches,
            },
            { skipCostUpdate: true },
          );
        }
      }
      throw err;
    }
  };

  const finish = async (
    saleDoc: Awaited<ReturnType<typeof run>>["sale"],
    audit: DeductionAuditEntry[],
  ) => {
    // Refresh weighted costs after commit — keep it off the checkout critical path
    const productIds = [...new Set(audit.map((a) => a.productId))];
    if (productIds.length > 0) {
      void refreshCostFifo(productIds).catch(() => {
        /* non-fatal */
      });
    }
    return { sale: saleDoc, deduplicated: false as const };
  };

  // Prefer MongoDB multi-document transaction; fall back to compensating rollback
  if (transactionsSupported !== false) {
    const session = await mongoose.startSession();
    try {
      let result: Awaited<ReturnType<typeof run>> | undefined;
      await session.withTransaction(async () => {
        result = await run(session);
      });
      transactionsSupported = true;
      if (result) {
        return finish(result.sale, result.audit);
      }
    } catch (err) {
      if (isTxnUnsupported(err)) {
        transactionsSupported = false;
      } else {
        if (
          idempotencyKey &&
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code?: number }).code === 11000
        ) {
          const dup = await Sale.findOne({ idempotencyKey });
          if (dup) return { sale: dup, deduplicated: true as const };
        }
        throw err;
      }
    } finally {
      await session.endSession();
    }
  }

  const result = await run(null);
  return finish(result.sale, result.audit);
}

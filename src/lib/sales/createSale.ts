import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import {
  deductFifoMany,
  refreshCostFifo,
  restoreFifo,
} from "@/lib/inventory";
import { AppSettings, Customer, Sale } from "@/lib/models";
import { loosePhoneRegex, phoneDigits } from "@/lib/phone";
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
  /** Known CRM id from POS phone match — skips customer upsert round-trip wait. */
  customerId?: string;
  salesperson?: string;
  payment: string;
  lines: IncomingSaleLine[];
  status?: "completed" | "held" | "void";
  idempotencyKey?: string;
  /** BRN-08: stamp from session when present */
  branchId?: string | null;
  branchName?: string | null;
};

/** Short TTL cache — AppSettings rarely changes during a POS shift. */
let salespersonCache:
  | { at: number; salespeople: string[]; active: string }
  | null = null;
const SALESPERSON_CACHE_MS = 120_000;

/** Primary-only ack — much faster than connection-string w=majority on Atlas. */
const FAST_WC = { w: 1 as const, j: false };

function isDuplicateKey(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

async function resolveSalesperson(value?: string) {
  const now = Date.now();
  if (!salespersonCache || now - salespersonCache.at > SALESPERSON_CACHE_MS) {
    const settings = await AppSettings.findOne({ key: "default" })
      .select("salespeople activeSalesperson")
      .lean();
    const configured = Array.isArray(settings?.salespeople)
      ? settings.salespeople
          .map((name: unknown) => String(name).trim())
          .filter(Boolean)
      : [];
    if (configured.length === 0) {
      throw new SaleError(
        "VALIDATION",
        "Set an active salesperson in Settings → Sales Team",
      );
    }
    const active = String(
      (settings as { activeSalesperson?: string } | null)?.activeSalesperson ||
        "",
    ).trim();
    salespersonCache = { at: now, salespeople: configured, active };
  }

  const { salespeople, active } = salespersonCache;
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
    throw new SaleError("VALIDATION", `Unknown salesperson: ${requested}`);
  }

  throw new SaleError(
    "VALIDATION",
    "Set an active salesperson in Settings → Sales Team",
  );
}

/** CRM-02/CRM-12: capture what a customer buys at order time — no manual re-entry in CRM. */
function productNamesFromLines(lines: ValidatedSaleLine[]): string[] {
  const names = new Set<string>();
  for (const l of lines) {
    const name = l.name?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

type CustomerTouchUpdate = {
  $set?: Record<string, unknown>;
  $inc?: Record<string, unknown>;
  $addToSet?: Record<string, unknown>;
};

/**
 * CRM-11: match the existing customer by phone (format-tolerant — "+971 50 123 4567"
 * and "971501234567" are the same person) before creating a new profile, so the same
 * person's orders on different dates (e.g. the 12th and the 19th) land in one history
 * instead of splitting across duplicate customers.
 */
async function resolveCustomerByPhone(
  phone: string,
  givenName: string | undefined,
  update: CustomerTouchUpdate,
): Promise<mongoose.Types.ObjectId> {
  const digits = phoneDigits(phone);
  const filter =
    digits.length >= 7 ? { phone: { $regex: loosePhoneRegex(digits) } } : { phone };

  const existing = await Customer.findOne(filter).select("_id");
  if (existing) {
    await Customer.updateOne({ _id: existing._id }, update, {
      writeConcern: FAST_WC,
    });
    return existing._id as mongoose.Types.ObjectId;
  }

  const created = await Customer.findOneAndUpdate(
    { phone },
    {
      $setOnInsert: {
        phone,
        preferences: [] as string[],
        ...(givenName ? {} : { name: "Walk-in Customer" }),
      },
      ...update,
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      writeConcern: FAST_WC,
    },
  );
  if (!created) {
    throw new SaleError("VALIDATION", "Could not resolve customer");
  }
  return created._id as mongoose.Types.ObjectId;
}

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
): Promise<DeductionAuditEntry[]> {
  const coalesced = coalesceDeductions(deductions);
  if (coalesced.length === 0) return [];

  const byId = await deductFifoMany(
    coalesced.map((n) => ({
      productId: n.productId,
      qty: n.qty,
      productName: n.productName,
    })),
    { skipCostUpdate: true },
  );

  return coalesced.map((need) => {
    const result = byId.get(need.productId) ?? { costTotal: 0, batches: [] };
    return {
      productId: need.productId,
      productName: need.productName,
      qty: need.qty,
      reason: need.reason,
      lineIndex: need.lineIndex,
      batches: result.batches,
      costTotal: result.costTotal,
    };
  });
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

function normalizePayment(value: string): string {
  const raw = (value || "cash").toLowerCase();
  if (
    raw === "cash" ||
    raw === "card" ||
    raw === "bank" ||
    raw === "credit" ||
    raw === "mixed"
  ) {
    return raw;
  }
  return "cash";
}

function asObjectId(id?: string) {
  if (id && mongoose.isValidObjectId(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return undefined;
}

/** Native insert needs ObjectIds — mongoose casting is skipped. */
function linesForInsert(lines: ValidatedSaleLine[]) {
  return lines.map((l) => ({
    productId: asObjectId(l.productId),
    name: l.name,
    qty: l.qty,
    unitLabel: l.unitLabel,
    unitPrice: l.unitPrice,
    lineType: l.lineType,
    bomNote: l.bomNote,
    deductMl: l.deductMl,
    oilProductId: asObjectId(l.oilProductId),
    oilMl: l.oilMl,
    formulaId: asObjectId(l.formulaId),
    packagingProductIds: Array.isArray(l.packagingProductIds)
      ? l.packagingProductIds
          .filter((id) => mongoose.isValidObjectId(id))
          .map((id) => new mongoose.Types.ObjectId(id))
      : [],
  }));
}

function auditForInsert(audit: DeductionAuditEntry[]) {
  return audit.map((a) => ({
    productId: new mongoose.Types.ObjectId(a.productId),
    productName: a.productName,
    qty: a.qty,
    reason: a.reason,
    lineIndex: a.lineIndex,
    costTotal: a.costTotal,
    batches: a.batches.map((b) => ({
      layerId: new mongoose.Types.ObjectId(b.layerId),
      qty: b.qty,
      unitCost: b.unitCost,
      purchaseDate: b.purchaseDate,
    })),
  }));
}

const HELD_LINE_TYPES = new Set([
  "ready",
  "remix",
  "oil",
  "refill",
  "packaging",
  "wholesale",
]);

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
    lines.push({
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
      formulaId: raw.formulaId,
    });
    subtotal += qty * unitPrice;
  }

  const givenName = input.customerName?.trim();
  const knownId =
    input.customerId && mongoose.isValidObjectId(input.customerId)
      ? input.customerId
      : null;
  const productNames = productNamesFromLines(lines);

  let customerId: mongoose.Types.ObjectId;
  if (knownId) {
    customerId = new mongoose.Types.ObjectId(knownId);
    void Customer.updateOne(
      { _id: customerId },
      {
        ...(givenName ? { $set: { name: givenName } } : {}),
        ...(productNames.length > 0
          ? { $addToSet: { productsRequested: { $each: productNames } } }
          : {}),
      },
      { writeConcern: FAST_WC },
    ).catch(() => {
      /* non-blocking */
    });
  } else {
    customerId = await resolveCustomerByPhone(phone, givenName, {
      ...(givenName ? { $set: { name: givenName } } : {}),
      ...(productNames.length > 0
        ? { $addToSet: { productsRequested: { $each: productNames } } }
        : {}),
    });
  }

  const displayName = givenName || "Walk-in Customer";
  const now = new Date();
  const _id = new mongoose.Types.ObjectId();
  const doc = {
    _id,
    customerPhone: phone,
    customerName: displayName,
    customerId,
    salesperson,
    payment: normalizePayment(input.payment),
    status: "held" as const,
    lines: linesForInsert(lines),
    subtotal,
    total: subtotal,
    saleType: resolveSaleType(lines),
    inventoryDeductions: [],
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.branchName ? { branchName: input.branchName } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await Sale.collection.insertOne(doc, { writeConcern: FAST_WC });

  return {
    sale: { ...doc, id: String(_id) },
    deduplicated: false as const,
    timingMs: undefined as
      | {
          total: number;
          validate: number;
          stock: number;
          insert: number;
        }
      | undefined,
  };
}

async function rollbackAudit(audit: DeductionAuditEntry[]) {
  await Promise.all(
    audit.map((entry) =>
      restoreFifo(
        entry.productId,
        { costTotal: entry.costTotal, batches: entry.batches },
        { skipCostUpdate: true },
      ),
    ),
  );
}

async function rollbackCustomerTotals(
  customerId: mongoose.Types.ObjectId | null,
  subtotal: number,
  payment: string,
) {
  if (!customerId) return;
  await Customer.updateOne(
    { _id: customerId },
    {
      $inc: {
        totalPurchases: -subtotal,
        ...(payment === "credit" ? { creditBalance: -subtotal } : {}),
      },
    },
    { writeConcern: FAST_WC },
  ).catch(() => {
    /* best-effort */
  });
}

/**
 * POS complete — target ≤2s on Atlas:
 * 1) validate (warm formula cache → usually 1 product read)
 * 2) parallel: FIFO deduct (reserve∥layers) + customer touch
 * 3) native Sale.insertOne (skip mongoose doc build)
 */
export async function createSale(input: CreateSaleInput) {
  const status = input.status ?? "completed";
  if (status === "held") return holdSale(input);

  const t0 = Date.now();
  await connectDB();

  if (!input.customerPhone?.trim()) {
    throw new SaleError("VALIDATION", "Customer phone is required");
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new SaleError("VALIDATION", "At least one line item is required");
  }

  const phone = input.customerPhone.trim();
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  const givenName = input.customerName?.trim();
  const knownCustomerId =
    input.customerId && mongoose.isValidObjectId(input.customerId)
      ? input.customerId
      : null;
  const payment = normalizePayment(input.payment);

  const [salesperson, validated] = await Promise.all([
    resolveSalesperson(input.salesperson),
    validateSaleLines(input.lines),
  ]);
  const tValidate = Date.now();

  const customerInc = {
    totalPurchases: validated.subtotal,
    ...(payment === "credit" ? { creditBalance: validated.subtotal } : {}),
  };
  const productNames = productNamesFromLines(validated.lines);

  let audit: DeductionAuditEntry[] = [];
  let customerTouched = false;
  let customerObjectId: mongoose.Types.ObjectId | null = knownCustomerId
    ? new mongoose.Types.ObjectId(knownCustomerId)
    : null;

  try {
    if (knownCustomerId && customerObjectId) {
      // Known customer: fire-and-forget stats update while FIFO runs (no return doc wait).
      const customerTouch = Customer.updateOne(
        { _id: customerObjectId },
        {
          $set: {
            lastVisit: new Date(),
            ...(givenName ? { name: givenName } : {}),
          },
          $inc: customerInc,
          // CRM-02/CRM-12: what they bought becomes "Products Requested" automatically.
          ...(productNames.length > 0
            ? { $addToSet: { productsRequested: { $each: productNames } } }
            : {}),
        },
        { writeConcern: FAST_WC },
      ).then(() => {
        customerTouched = true;
      });

      const [deductionAudit] = await Promise.all([
        validated.deductions.length > 0
          ? applyDeductions(validated.deductions)
          : Promise.resolve([] as DeductionAuditEntry[]),
        customerTouch,
      ]);
      audit = deductionAudit;
    } else {
      const [deductionAudit, resolvedCustomerId] = await Promise.all([
        validated.deductions.length > 0
          ? applyDeductions(validated.deductions)
          : Promise.resolve([] as DeductionAuditEntry[]),
        resolveCustomerByPhone(phone, givenName, {
          $set: {
            lastVisit: new Date(),
            ...(givenName ? { name: givenName } : {}),
          },
          $inc: customerInc,
          ...(productNames.length > 0
            ? { $addToSet: { productsRequested: { $each: productNames } } }
            : {}),
        }),
      ]);
      audit = deductionAudit;
      customerTouched = true;
      customerObjectId = resolvedCustomerId;
    }

    const tStock = Date.now();
    const displayName = givenName || "Walk-in";
    const now = new Date();
    const _id = new mongoose.Types.ObjectId();
    const saleDoc = {
      _id,
      customerPhone: phone,
      customerName: displayName,
      customerId: customerObjectId,
      salesperson,
      payment,
      status,
      lines: linesForInsert(validated.lines),
      subtotal: validated.subtotal,
      total: validated.subtotal,
      saleType: resolveSaleType(validated.lines),
      idempotencyKey,
      inventoryDeductions: auditForInsert(audit),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.branchName ? { branchName: input.branchName } : {}),
      createdAt: now,
      updatedAt: now,
    };

    try {
      await Sale.collection.insertOne(saleDoc, { writeConcern: FAST_WC });
    } catch (err) {
      if (idempotencyKey && isDuplicateKey(err)) {
        const dup = await Sale.findOne({ idempotencyKey }).lean();
        if (dup) {
          if (audit.length) await rollbackAudit(audit);
          if (customerTouched) {
            await rollbackCustomerTotals(customerObjectId, validated.subtotal, payment);
          }
          return {
            sale: { ...dup, id: String(dup._id) },
            deduplicated: true as const,
            timingMs: {
              total: Date.now() - t0,
              validate: tValidate - t0,
              stock: tStock - tValidate,
              insert: Date.now() - tStock,
            },
          };
        }
      }
      throw err;
    }

    const productIds = [...new Set(audit.map((a) => a.productId))];
    if (productIds.length > 0) {
      void refreshCostFifo(productIds).catch(() => {
        /* non-fatal — after response */
      });
    }

    const timingMs = {
      total: Date.now() - t0,
      validate: tValidate - t0,
      stock: tStock - tValidate,
      insert: Date.now() - tStock,
    };
    if (timingMs.total > 2000) {
      console.warn("[createSale] slow POS complete", timingMs);
    }

    return {
      sale: { ...saleDoc, id: String(_id) },
      deduplicated: false as const,
      timingMs,
    };
  } catch (err) {
    if (idempotencyKey && isDuplicateKey(err)) {
      const dup = await Sale.findOne({ idempotencyKey }).lean();
      if (dup) {
        if (audit.length) await rollbackAudit(audit);
        if (customerTouched) {
          await rollbackCustomerTotals(customerObjectId, validated.subtotal, payment);
        }
        return {
          sale: { ...dup, id: String(dup._id) },
          deduplicated: true as const,
        };
      }
    }
    if (audit.length) await rollbackAudit(audit);
    if (customerTouched) {
      await rollbackCustomerTotals(customerObjectId, validated.subtotal, payment);
    }
    throw err;
  }
}

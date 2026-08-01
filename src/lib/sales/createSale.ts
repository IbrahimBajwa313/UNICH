import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import {
  deductFifoMany,
  refreshCostFifo,
  restoreFifo,
} from "@/lib/inventory";
import { AppSettings, Customer, Sale } from "@/lib/models";
import { SaleError } from "@/lib/sales/errors";
import {
  tryFastValidateSaleLines,
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

/** Short TTL cache — AppSettings rarely changes during a POS shift. */
let salespersonCache:
  | { at: number; salespeople: string[]; active: string; fallback: string }
  | null = null;
const SALESPERSON_CACHE_MS = 120_000;

/** Primary-only ack — much faster than connection-string w=majority on Atlas. */
const FAST_WC = { w: 1 as const, j: false };

async function resolveSalesperson(value?: string) {
  const now = Date.now();
  if (!salespersonCache || now - salespersonCache.at > SALESPERSON_CACHE_MS) {
    const settings = await AppSettings.findOne({ key: "default" })
      .select("salespeople currentUserName activeSalesperson")
      .lean();
    const configured = Array.isArray(settings?.salespeople)
      ? settings.salespeople
          .map((name: unknown) => String(name).trim())
          .filter(Boolean)
      : [];
    const fallback = String(
      settings?.currentUserName || "Ahmad Ibrahim",
    ).trim();
    const salespeople = configured.length > 0 ? configured : [fallback];
    const active = String(
      (settings as { activeSalesperson?: string } | null)?.activeSalesperson ||
        "",
    ).trim();
    salespersonCache = { at: now, salespeople, active, fallback };
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
  }

  if (salespeople[0]) return salespeople[0];
  throw new SaleError("VALIDATION", "Set an active salesperson in Settings");
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
    });
    subtotal += qty * unitPrice;
  }

  const givenName = input.customerName?.trim();
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
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      writeConcern: FAST_WC,
    },
  );

  if (!customer) {
    throw new SaleError("VALIDATION", "Could not resolve customer for hold");
  }

  const displayName = givenName || customer.name || "Walk-in Customer";
  const sale = await Sale.create(
    [
      {
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
      },
    ],
    { writeConcern: FAST_WC },
  );

  return { sale: sale[0], deduplicated: false as const };
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

/**
 * POS complete — target 1–3s on Atlas:
 * 1) fast retail validate (0 DB) or full validate
 * 2) parallel: stock deduct + customer upsert
 * 3) one Sale.insert
 * Idempotency relies on unique index (no pre-read).
 */
export async function createSale(input: CreateSaleInput) {
  const status = input.status ?? "completed";
  if (status === "held") return holdSale(input);

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

  // Validate + salesperson in parallel (salesperson usually cached → instant)
  const fast = tryFastValidateSaleLines(input.lines);
  const [salesperson, validated] = await Promise.all([
    resolveSalesperson(input.salesperson),
    fast
      ? Promise.resolve(fast)
      : validateSaleLines(input.lines),
  ]);

  let audit: DeductionAuditEntry[] = [];

  const customerUpdate = {
    $setOnInsert: {
      phone,
      preferences: [] as string[],
      totalPurchases: 0,
      creditBalance: 0,
      ...(givenName ? {} : { name: "Walk-in Customer" }),
    },
    $set: {
      lastVisit: new Date(),
      ...(givenName ? { name: givenName } : {}),
    },
    $inc: {
      totalPurchases: validated.subtotal,
      ...(input.payment === "credit"
        ? { creditBalance: validated.subtotal }
        : {}),
    },
  };

  try {
    // Critical path: deduct stock + upsert customer together
    const [deductionAudit, customer] = await Promise.all([
      validated.deductions.length > 0
        ? applyDeductions(validated.deductions)
        : Promise.resolve([] as DeductionAuditEntry[]),
      Customer.findOneAndUpdate({ phone }, customerUpdate, {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
        writeConcern: FAST_WC,
      }),
    ]);
    audit = deductionAudit;

    if (!customer) {
      throw new SaleError("VALIDATION", "Could not resolve customer");
    }

    const displayName = givenName || customer.name || "Walk-in";
    const docs = await Sale.create(
      [
        {
          customerPhone: phone,
          customerName: displayName,
          customerId: customer._id,
          salesperson,
          payment: input.payment,
          status,
          lines: validated.lines,
          subtotal: validated.subtotal,
          total: validated.subtotal,
          saleType: resolveSaleType(validated.lines),
          idempotencyKey,
          inventoryDeductions: audit,
        },
      ],
      { writeConcern: FAST_WC },
    );

    const productIds = [...new Set(audit.map((a) => a.productId))];
    if (productIds.length > 0) {
      void refreshCostFifo(productIds).catch(() => {
        /* non-fatal */
      });
    }

    return { sale: docs[0], deduplicated: false as const };
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
        if (audit.length) await rollbackAudit(audit);
        return { sale: dup, deduplicated: true as const };
      }
    }
    if (audit.length) await rollbackAudit(audit);
    throw err;
  }
}

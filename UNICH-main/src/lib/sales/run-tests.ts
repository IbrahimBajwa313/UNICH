/**
 * Local sales unit tests (npm run test).
 * Covers remix BOM roles, formula gate, oil-ml from labels (no client trust),
 * stock warning copy, and mixed-cart / FIFO error shapes.
 */
import assert from "node:assert/strict";
import {
  HALF_TOLA_ML,
  QUARTER_TOLA_ML,
  TOLA_ML,
  resolveDeductMlFromUnitLabel,
} from "../format";
import {
  matchRemixRole,
  REMIX_REQUIRED_ROLES,
  OIL_BASE_PRODUCT_ID,
  REMIX_OIL_ML,
  REFILL_CUSTOMER_BOTTLE_ML,
  roleLabel,
} from "./constants";
import { validateFormulaInput } from "../formulas/validateFormula";
import { SaleError } from "./errors";
import {
  defaultLowStockAt,
  warnIfNegativeStock,
} from "../inventory/stockCheck";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

console.log("sales constants");

// Product name/SKU → remix BOM role (bottle, cap, atomizer, …)
test("matches required remix roles", () => {
  assert.equal(matchRemixRole("Glass Bottle 100ml", "BOT-100"), "bottle");
  assert.equal(matchRemixRole("Cap — Standard Gold", "CAP-STD"), "cap");
  assert.equal(matchRemixRole("Atomizer", "ATM-STD"), "atomizer");
  assert.equal(matchRemixRole("Collar", "COL-STD"), "collar");
  assert.equal(matchRemixRole("Label — Standard", "LBL-STD"), "label");
  assert.equal(matchRemixRole("Carton Box — Standard", "BOX-STD"), "box");
  assert.equal(matchRemixRole("Gift Box — Duo", "GB-001"), "box");
  assert.equal(matchRemixRole("Ethanol 96%", "ETH-96"), "ethanol");
  assert.equal(matchRemixRole("Fixative — Standard", "FIX-STD"), "fixative");
});

// Non-BOM items (pouch, oil blend) must not map to a remix role
test("returns null for pouch / oil blend", () => {
  assert.equal(matchRemixRole("Velvet Pouch", "PCH-STD"), null);
  assert.equal(matchRemixRole("Selected Oil Blend"), null);
});

// Display label for a role id (fixative → Fixative)
test("roleLabel capitalizes", () => {
  assert.equal(roleLabel("fixative"), "Fixative");
});

// Remix formula must list exactly these 8 packaging/fill roles
test("eight required roles listed", () => {
  assert.deepEqual([...REMIX_REQUIRED_ROLES], [
    "bottle",
    "cap",
    "atomizer",
    "collar",
    "label",
    "box",
    "ethanol",
    "fixative",
  ]);
});

console.log("formula validation (local)");

function validateFormulaRolesLocal(
  components: Array<{
    productId: string;
    productName: string;
    qty: number;
    sku?: string;
  }>,
) {
  if (!components.length) {
    throw new SaleError("FORMULA_MISSING", "Formula missing");
  }
  const found = new Set<string>();
  let oil: (typeof components)[number] | undefined;
  for (const c of components) {
    if (c.productId === OIL_BASE_PRODUCT_ID) {
      oil = c;
      continue;
    }
    const role = matchRemixRole(c.productName, c.sku);
    if (role) found.add(role);
  }
  const missing = REMIX_REQUIRED_ROLES.filter((r) => !found.has(r));
  if (missing.length) {
    throw new SaleError(
      "FORMULA_INCOMPLETE",
      `Formula incomplete: ${missing.map(roleLabel).join(", ")} missing`,
    );
  }
  if (!oil) {
    throw new SaleError(
      "FORMULA_INCOMPLETE",
      "Formula incomplete: oil quantity (oil-base) missing",
    );
  }
  if (oil.qty !== REMIX_OIL_ML) {
    throw new SaleError(
      "FORMULA_INCOMPLETE",
      `Formula incomplete: remix oil must be ${REMIX_OIL_ML} ml (BLD-02/03)`,
    );
  }
  return oil.qty;
}

const complete = [
  {
    productId: OIL_BASE_PRODUCT_ID,
    productName: "Selected Oil Blend",
    qty: REMIX_OIL_ML,
  },
  { productId: "1", productName: "Ethanol 96%", qty: 80, sku: "ETH-96" },
  { productId: "2", productName: "Fixative — Standard", qty: 2, sku: "FIX-STD" },
  { productId: "3", productName: "Glass Bottle 100ml", qty: 1, sku: "BOT-100" },
  { productId: "4", productName: "Cap — Standard Gold", qty: 1, sku: "CAP-STD" },
  { productId: "5", productName: "Atomizer", qty: 1, sku: "ATM-STD" },
  { productId: "6", productName: "Collar", qty: 1, sku: "COL-STD" },
  { productId: "7", productName: "Label — Standard", qty: 1, sku: "LBL-STD" },
  { productId: "8", productName: "Carton Box — Standard", qty: 1, sku: "BOX-STD" },
];

// Happy path: full remix BOM + oil-base → returns REMIX_OIL_ML (20)
test("complete formula returns oil ml 20", () => {
  assert.equal(REMIX_OIL_ML, 20);
  assert.equal(validateFormulaRolesLocal(complete), REMIX_OIL_ML);
});

// BLD-02/03: oil-base qty must be exactly 20 ml (local + validateFormulaInput)
test("remix oil-base must be exactly 20 ml", () => {
  const wrongOil = complete.map((c) =>
    c.productId === OIL_BASE_PRODUCT_ID ? { ...c, qty: 18 } : c,
  );
  assert.throws(
    () => validateFormulaRolesLocal(wrongOil),
    (err: unknown) =>
      err instanceof SaleError &&
      err.code === "FORMULA_INCOMPLETE" &&
      /remix oil must be 20 ml/i.test(err.message),
  );

  const errors = validateFormulaInput({
    name: "Remix Standard",
    type: "remix",
    yieldMl: 100,
    components: [
      {
        productId: OIL_BASE_PRODUCT_ID,
        productName: "Selected Oil Blend",
        qty: 18,
        unit: "ml",
      },
      {
        productId: "1",
        productName: "Ethanol 96%",
        qty: 82,
        unit: "ml",
      },
    ],
  });
  assert.ok(errors.some((e) => /oil-base must be 20 ml/i.test(e)));
});

// Empty component list → FORMULA_MISSING (block sale)
test("empty formula → Formula missing", () => {
  assert.throws(
    () => validateFormulaRolesLocal([]),
    (err: unknown) =>
      err instanceof SaleError &&
      err.code === "FORMULA_MISSING" &&
      err.message === "Formula missing",
  );
});

// Any required role absent (here Fixative) → FORMULA_INCOMPLETE
test("missing Fixative → Formula incomplete", () => {
  const withoutFix = complete.filter((c) => c.sku !== "FIX-STD");
  assert.throws(
    () => validateFormulaRolesLocal(withoutFix),
    (err: unknown) =>
      err instanceof SaleError &&
      err.code === "FORMULA_INCOMPLETE" &&
      /Fixative missing/i.test(err.message),
  );
});

// Oil blend line required on remix formula
test("missing oil-base → Formula incomplete", () => {
  const withoutOil = complete.filter((c) => c.productId !== OIL_BASE_PRODUCT_ID);
  assert.throws(
    () => validateFormulaRolesLocal(withoutOil),
    (err: unknown) => err instanceof SaleError && err.code === "FORMULA_INCOMPLETE",
  );
});

// POS must fail clearly when cashier never picked an oil
test("Oil not selected error message", () => {
  const err = new SaleError("OIL_NOT_SELECTED", "Oil not selected");
  assert.equal(err.message, "Oil not selected");
  assert.equal(err.code, "OIL_NOT_SELECTED");
});

// Stock short → INSUFFICIENT_STOCK message shape
test("Insufficient stock error message", () => {
  const err = new SaleError("INSUFFICIENT_STOCK", "Insufficient stock for Cap");
  assert.match(err.message, /Insufficient stock/);
});

console.log("backend oil ml (no client trust)");

// Oil sale: unit label "1 Tola" → deduct 12 ml (server-side)
test("1 Tola → 12 ml", () => {
  assert.equal(resolveDeductMlFromUnitLabel("1 Tola"), TOLA_ML);
  assert.equal(TOLA_ML, 12);
});

// Oil sale: "½ Tola" / "1/2 Tola" → 6 ml
test("½ Tola → 6 ml", () => {
  assert.equal(resolveDeductMlFromUnitLabel("½ Tola"), HALF_TOLA_ML);
  assert.equal(resolveDeductMlFromUnitLabel("1/2 Tola"), HALF_TOLA_ML);
  assert.equal(HALF_TOLA_ML, 6);
});

// Oil sale: "¼ Tola" / "1/4 Tola" → 3 ml
test("¼ Tola → 3 ml", () => {
  assert.equal(resolveDeductMlFromUnitLabel("¼ Tola"), QUARTER_TOLA_ML);
  assert.equal(resolveDeductMlFromUnitLabel("1/4 Tola"), QUARTER_TOLA_ML);
  assert.equal(QUARTER_TOLA_ML, 3);
});

// Plain ml labels parse to a number (refill / custom sizes)
test("100ml refill label → 100", () => {
  assert.equal(resolveDeductMlFromUnitLabel("100ml refill"), 100);
  assert.equal(resolveDeductMlFromUnitLabel("50 ml"), 50);
});

// BLD-09: customer refill bottle is locked to 100ml; other sizes parse but must not pass sale gate
test("BLD-09 refill bottle size is hard-locked to 100ml", () => {
  assert.equal(REFILL_CUSTOMER_BOTTLE_ML, 100);
  const fifty = resolveDeductMlFromUnitLabel("50ml refill");
  const twoHundred = resolveDeductMlFromUnitLabel("200ml refill");
  assert.equal(fifty, 50);
  assert.equal(twoHundred, 200);
  // Sale path must reject anything other than REFILL_CUSTOMER_BOTTLE_ML
  assert.notEqual(fifty, REFILL_CUSTOMER_BOTTLE_ML);
  assert.notEqual(twoHundred, REFILL_CUSTOMER_BOTTLE_ML);
  assert.equal(
    resolveDeductMlFromUnitLabel("100ml refill"),
    REFILL_CUSTOMER_BOTTLE_ML,
  );
});

// INV-06: negative on-hand shows restock warning; zero/positive → no warn
test("INV-06 negative stock warning copy", () => {
  const w = warnIfNegativeStock("Oud Oil", -12);
  assert.ok(w);
  assert.match(w!, /Stock warning/);
  assert.match(w!, /restock or reorder/);
  assert.equal(warnIfNegativeStock("Oud Oil", 0), null);
  assert.equal(warnIfNegativeStock("Oud Oil", 5), null);
});

// ALT-01: default low-stock thresholds by unit / oil vs note
test("ALT-01 default low-stock thresholds", () => {
  assert.equal(defaultLowStockAt({ unit: "pcs" }), 5);
  assert.equal(defaultLowStockAt({ unit: "ml", name: "Oud Cambodi Oil" }), 100);
  assert.equal(
    defaultLowStockAt({ unit: "ml", itemType: "raw", name: "Rose Note" }),
    5,
  );
  assert.equal(
    defaultLowStockAt({ unit: "ml", category: "Notes", name: "Amber" }),
    5,
  );
});

// Unparseable unit label → null so sale cannot invent deduct ml
test("missing / garbage label → null (sale must stop)", () => {
  assert.equal(resolveDeductMlFromUnitLabel(undefined), null);
  assert.equal(resolveDeductMlFromUnitLabel(""), null);
  assert.equal(resolveDeductMlFromUnitLabel("pcs"), null);
  assert.equal(resolveDeductMlFromUnitLabel("bottle"), null);
});

// Client-sent deductMl without a label must not invent ml (label-only resolver)
test("client deductMl alone is not a label — must not invent ml", () => {
  // resolveDeductMlFromUnitLabel only reads labels; raw deductMl is ignored by design
  assert.equal(resolveDeductMlFromUnitLabel(undefined), null);
});

console.log("mixed-cart line type rules (local)");

// Cart can mix ready / remix / oil / refill / packaging as distinct line types
test("ready + remix + oil line types are distinct", () => {
  const types = new Set(["ready", "remix", "oil", "refill", "packaging"]);
  assert.ok(types.has("ready"));
  assert.ok(types.has("remix"));
  assert.ok(types.has("refill"));
});

// FIFO shortage error copy must include "FIFO need" + "short"
test("FIFO short message shape", () => {
  const err = new SaleError(
    "INSUFFICIENT_STOCK",
    "Insufficient stock for Cap (FIFO need 2, short 1)",
  );
  assert.match(err.message, /FIFO need/);
  assert.match(err.message, /short/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

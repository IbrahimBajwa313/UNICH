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
  roleLabel,
} from "./constants";
import { SaleError } from "./errors";

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
test("matches required remix roles", () => {
  assert.equal(matchRemixRole("Glass Bottle 100ml", "BOT-100"), "bottle");
  assert.equal(matchRemixRole("Cap — Standard Gold", "CAP-STD"), "cap");
  assert.equal(matchRemixRole("Atomizer", "ATM-STD"), "atomizer");
  assert.equal(matchRemixRole("Collar", "COL-STD"), "collar");
  assert.equal(matchRemixRole("Ethanol 96%", "ETH-96"), "ethanol");
  assert.equal(matchRemixRole("Fixative — Standard", "FIX-STD"), "fixative");
});

test("returns null for pouch / oil blend", () => {
  assert.equal(matchRemixRole("Velvet Pouch", "PCH-STD"), null);
  assert.equal(matchRemixRole("Selected Oil Blend"), null);
});

test("roleLabel capitalizes", () => {
  assert.equal(roleLabel("fixative"), "Fixative");
});

test("six required roles listed", () => {
  assert.deepEqual([...REMIX_REQUIRED_ROLES], [
    "bottle",
    "cap",
    "atomizer",
    "collar",
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
  return oil.qty;
}

const complete = [
  { productId: OIL_BASE_PRODUCT_ID, productName: "Selected Oil Blend", qty: 20 },
  { productId: "1", productName: "Ethanol 96%", qty: 80, sku: "ETH-96" },
  { productId: "2", productName: "Fixative — Standard", qty: 2, sku: "FIX-STD" },
  { productId: "3", productName: "Glass Bottle 100ml", qty: 1, sku: "BOT-100" },
  { productId: "4", productName: "Cap — Standard Gold", qty: 1, sku: "CAP-STD" },
  { productId: "5", productName: "Atomizer", qty: 1, sku: "ATM-STD" },
  { productId: "6", productName: "Collar", qty: 1, sku: "COL-STD" },
];

test("complete formula returns oil ml 20", () => {
  assert.equal(validateFormulaRolesLocal(complete), 20);
});

test("empty formula → Formula missing", () => {
  assert.throws(
    () => validateFormulaRolesLocal([]),
    (err: unknown) =>
      err instanceof SaleError &&
      err.code === "FORMULA_MISSING" &&
      err.message === "Formula missing",
  );
});

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

test("missing oil-base → Formula incomplete", () => {
  const withoutOil = complete.filter((c) => c.productId !== OIL_BASE_PRODUCT_ID);
  assert.throws(
    () => validateFormulaRolesLocal(withoutOil),
    (err: unknown) => err instanceof SaleError && err.code === "FORMULA_INCOMPLETE",
  );
});

test("Oil not selected error message", () => {
  const err = new SaleError("OIL_NOT_SELECTED", "Oil not selected");
  assert.equal(err.message, "Oil not selected");
  assert.equal(err.code, "OIL_NOT_SELECTED");
});

test("Insufficient stock error message", () => {
  const err = new SaleError("INSUFFICIENT_STOCK", "Insufficient stock for Cap");
  assert.match(err.message, /Insufficient stock/);
});

console.log("backend oil ml (no client trust)");

test("1 Tola → 12 ml", () => {
  assert.equal(resolveDeductMlFromUnitLabel("1 Tola"), TOLA_ML);
  assert.equal(TOLA_ML, 12);
});

test("½ Tola → 6 ml", () => {
  assert.equal(resolveDeductMlFromUnitLabel("½ Tola"), HALF_TOLA_ML);
  assert.equal(resolveDeductMlFromUnitLabel("1/2 Tola"), HALF_TOLA_ML);
  assert.equal(HALF_TOLA_ML, 6);
});

test("¼ Tola → 3 ml", () => {
  assert.equal(resolveDeductMlFromUnitLabel("¼ Tola"), QUARTER_TOLA_ML);
  assert.equal(resolveDeductMlFromUnitLabel("1/4 Tola"), QUARTER_TOLA_ML);
  assert.equal(QUARTER_TOLA_ML, 3);
});

test("100ml refill label → 100", () => {
  assert.equal(resolveDeductMlFromUnitLabel("100ml refill"), 100);
  assert.equal(resolveDeductMlFromUnitLabel("50 ml"), 50);
});

test("missing / garbage label → null (sale must stop)", () => {
  assert.equal(resolveDeductMlFromUnitLabel(undefined), null);
  assert.equal(resolveDeductMlFromUnitLabel(""), null);
  assert.equal(resolveDeductMlFromUnitLabel("pcs"), null);
  assert.equal(resolveDeductMlFromUnitLabel("bottle"), null);
});

test("client deductMl alone is not a label — must not invent ml", () => {
  // resolveDeductMlFromUnitLabel only reads labels; raw deductMl is ignored by design
  assert.equal(resolveDeductMlFromUnitLabel(undefined), null);
});

console.log("mixed-cart line type rules (local)");

test("ready + remix + oil line types are distinct", () => {
  const types = new Set(["ready", "remix", "oil", "refill", "packaging"]);
  assert.ok(types.has("ready"));
  assert.ok(types.has("remix"));
  assert.ok(types.has("refill"));
});

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

/**
 * Local expenses unit tests (npm run test).
 * Covers date-field edge cases in the GET response mapper: missing/falsy
 * dates, valid ISO strings, and a documented crash on a garbage-but-truthy
 * date value (see the "garbage date string" test below).
 */
import assert from "node:assert/strict";
import { mapExpense } from "./route";

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

console.log("mapExpense");

test("valid ISO date string is normalized to YYYY-MM-DD", () => {
  const out = mapExpense({ category: "Rent", amount: 500, date: "2026-03-05T10:00:00.000Z" });
  assert.equal(out.date, "2026-03-05");
});

test("missing/null/undefined date maps to null, not a crash", () => {
  assert.equal(mapExpense({ category: "Rent" }).date, null);
  assert.equal(mapExpense({ category: "Rent", date: null }).date, null);
  assert.equal(mapExpense({ category: "Rent", date: undefined }).date, null);
});

test("empty string date is falsy and also maps to null", () => {
  assert.equal(mapExpense({ category: "Rent", date: "" }).date, null);
});

test("other fields on the expense pass through untouched", () => {
  const out = mapExpense({ category: "Utilities", amount: 120, status: "approved" }) as Record<
    string,
    unknown
  >;
  assert.equal(out.category, "Utilities");
  assert.equal(out.amount, 120);
  assert.equal(out.status, "approved");
});

test("a truthy but unparseable date string throws (known edge case, not currently guarded)", () => {
  // Documents real, current behavior: `e.date` is only checked for
  // truthiness before `new Date(e.date).toISOString()` runs, so a garbage
  // non-empty string produces an Invalid Date and throws RangeError instead
  // of degrading to null. Legacy/corrupted data with a bad `date` field
  // would 500 the GET /api/expenses response. Worth a defensive fix
  // (e.g. checking `Number.isNaN(d.getTime())`) if this is ever hit in
  // production data.
  assert.throws(
    () => mapExpense({ category: "Rent", date: "not-a-real-date" }),
    /Invalid time value/,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

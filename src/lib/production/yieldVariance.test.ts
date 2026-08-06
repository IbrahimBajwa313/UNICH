import assert from "node:assert/strict";
import {
  assertYieldWithinTolerance,
  computeYieldVariance,
  YIELD_TOLERANCE_ML,
} from "@/lib/production/yieldVariance";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`FAIL — ${name}`);
    throw err;
  }
}

test("BLD-06 within ±5 ml", () => {
  const r = computeYieldVariance(100, 104);
  assert.equal(r.varianceMl, 4);
  assert.equal(r.wastageMl, 0);
  assert.equal(r.withinTolerance, true);
});

test("BLD-06 exactly ±5 ml is ok", () => {
  assert.equal(computeYieldVariance(100, 95).withinTolerance, true);
  assert.equal(computeYieldVariance(100, 105).withinTolerance, true);
});

test("BLD-06 outside tolerance fails assert", () => {
  assert.throws(() => assertYieldWithinTolerance(100, 90), /exceeds/);
});

test("BLD-06 wastage is shortfall only", () => {
  const r = computeYieldVariance(100, 97);
  assert.equal(r.wastageMl, 3);
  assert.equal(r.varianceMl, -3);
});

test(`tolerance constant is ${5}`, () => {
  assert.equal(YIELD_TOLERANCE_ML, 5);
});

console.log("yieldVariance tests passed");

/**
 * Local settings unit tests (npm run test).
 * Covers the sales-team normalization edge cases: dedupe behavior, mixed
 * separators, blank/whitespace-only input, and case-insensitive active-
 * salesperson matching.
 */
import assert from "node:assert/strict";
import { normalizeActiveSalesperson, normalizeSalespeople } from "./route";

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

console.log("normalizeSalespeople");

test("array input: trims, drops blanks, keeps order", () => {
  assert.deepEqual(
    normalizeSalespeople([" Ahmad ", "", "  ", "Sara"]),
    ["Ahmad", "Sara"],
  );
});

test("string input: splits on commas and newlines", () => {
  assert.deepEqual(
    normalizeSalespeople("Ahmad, Sara\nYoussef"),
    ["Ahmad", "Sara", "Youssef"],
  );
});

test("dedupe is case-sensitive: differently-cased duplicates both survive", () => {
  // Documents current behavior — "Ahmad" and "ahmad" are treated as distinct
  // entries because dedup uses a Set on the raw (trimmed) string.
  assert.deepEqual(
    normalizeSalespeople(["Ahmad", "ahmad"]),
    ["Ahmad", "ahmad"],
  );
});

test("empty array falls back to the provided fallback name", () => {
  assert.deepEqual(normalizeSalespeople([], "Owner Name"), ["Owner Name"]);
});

test("whitespace-only fallback name still resolves to the hardcoded default", () => {
  assert.deepEqual(normalizeSalespeople([], "   "), ["Ahmad Ibrahim"]);
});

test("no fallback at all resolves to the hardcoded default", () => {
  assert.deepEqual(normalizeSalespeople([]), ["Ahmad Ibrahim"]);
  assert.deepEqual(normalizeSalespeople(undefined), ["Ahmad Ibrahim"]);
});

test("non-array/non-string input (null, number, object) is treated as empty", () => {
  assert.deepEqual(normalizeSalespeople(null, "Fallback"), ["Fallback"]);
  assert.deepEqual(normalizeSalespeople(42, "Fallback"), ["Fallback"]);
  assert.deepEqual(normalizeSalespeople({}, "Fallback"), ["Fallback"]);
});

console.log("normalizeActiveSalesperson");

test("matches case-insensitively and returns the list's original casing", () => {
  assert.equal(
    normalizeActiveSalesperson("AHMAD IBRAHIM", ["Ahmad Ibrahim", "Sara Ahmed"]),
    "Ahmad Ibrahim",
  );
});

test("requested name not in the list falls back to the first salesperson", () => {
  assert.equal(
    normalizeActiveSalesperson("Someone Else", ["Ahmad Ibrahim", "Sara Ahmed"]),
    "Ahmad Ibrahim",
  );
});

test("empty/null requested value falls back to the first salesperson", () => {
  assert.equal(normalizeActiveSalesperson("", ["Ahmad Ibrahim"]), "Ahmad Ibrahim");
  assert.equal(normalizeActiveSalesperson(undefined, ["Ahmad Ibrahim"]), "Ahmad Ibrahim");
});

test("empty salespeople list falls back to fallbackName, then the hardcoded default", () => {
  assert.equal(normalizeActiveSalesperson("Ahmad", [], "Owner Name"), "Owner Name");
  assert.equal(normalizeActiveSalesperson("Ahmad", []), "Ahmad Ibrahim");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

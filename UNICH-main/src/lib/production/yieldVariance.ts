/** BLD-06: expected vs actual yield tolerance for all production. */
export const YIELD_TOLERANCE_ML = 5;

export type YieldVarianceResult = {
  expectedYieldMl: number;
  actualYieldMl: number;
  /** actual − expected (negative = shortfall / evaporation / wastage). */
  varianceMl: number;
  /** Shortfall volume when actual < expected (evaporation + process wastage). */
  wastageMl: number;
  withinTolerance: boolean;
};

/**
 * BLD-06: compute yield variance and ±5 ml tolerance check.
 */
export function computeYieldVariance(
  expectedYieldMl: number,
  actualYieldMl: number,
): YieldVarianceResult {
  const expected = Number(expectedYieldMl) || 0;
  const actual = Number(actualYieldMl) || 0;
  const varianceMl = Number((actual - expected).toFixed(3));
  const wastageMl = Number(Math.max(0, expected - actual).toFixed(3));
  const withinTolerance = Math.abs(varianceMl) <= YIELD_TOLERANCE_ML;
  return {
    expectedYieldMl: expected,
    actualYieldMl: actual,
    varianceMl,
    wastageMl,
    withinTolerance,
  };
}

export function assertYieldWithinTolerance(
  expectedYieldMl: number,
  actualYieldMl: number,
): YieldVarianceResult {
  const result = computeYieldVariance(expectedYieldMl, actualYieldMl);
  if (!(result.actualYieldMl > 0)) {
    throw new Error("Actual yield (ml) is required and must be greater than 0");
  }
  if (!result.withinTolerance) {
    throw new Error(
      `Yield variance ${result.varianceMl >= 0 ? "+" : ""}${result.varianceMl} ml exceeds ±${YIELD_TOLERANCE_ML} ml tolerance (expected ${result.expectedYieldMl} ml, actual ${result.actualYieldMl} ml)`,
    );
  }
  return result;
}

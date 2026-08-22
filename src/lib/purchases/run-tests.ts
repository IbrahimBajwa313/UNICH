/**
 * Local purchases unit tests (npm run test).
 * Covers PO status derivation, received-qty sync, FIFO-apply (via an
 * injected addFifoLayer stub, no DB), and supplier avg-lead-days (via
 * injected query/update stubs, no DB).
 */
import assert from "node:assert/strict";
import {
  derivePurchaseStatus,
  syncReceivedQtys,
  applyFifoFromPurchase,
  type PurchaseLineForFifo,
} from "./applyFifoFromPurchase";
import { averageLeadDays, recalcSupplierAvgLeadDays } from "./supplierLeadTime";

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

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

console.log("derivePurchaseStatus");

// No lines → fallback as-is
test("no lines → returns fallback", () => {
  assert.equal(derivePurchaseStatus([], "ordered"), "ordered");
  assert.equal(derivePurchaseStatus([]), "draft");
});

// Nothing received yet: draft/ordered fallback stays, received/partial downgrades to ordered
test("nothing received → fallback stays, or downgrades to ordered", () => {
  const lines = [{ qtyOrdered: 10, qtyReceived: 0 }];
  assert.equal(derivePurchaseStatus(lines, "draft"), "draft");
  assert.equal(derivePurchaseStatus(lines, "ordered"), "ordered");
  assert.equal(derivePurchaseStatus(lines, "received"), "ordered");
  assert.equal(derivePurchaseStatus(lines, "partial"), "ordered");
});

// All lines fully received → "received"
test("all lines fully received → received", () => {
  const lines = [
    { qtyOrdered: 10, qtyReceived: 10 },
    { qtyOrdered: 5, qtyReceived: 5 },
  ];
  assert.equal(derivePurchaseStatus(lines), "received");
});

// Some received, not all → "partial"
test("some but not all received → partial", () => {
  const lines = [
    { qtyOrdered: 10, qtyReceived: 10 },
    { qtyOrdered: 5, qtyReceived: 2 },
  ];
  assert.equal(derivePurchaseStatus(lines), "partial");
});

// Over-receipt (qtyReceived > qtyOrdered) still counts as fully received
test("over-received line still counts as received", () => {
  const lines = [{ qtyOrdered: 10, qtyReceived: 12 }];
  assert.equal(derivePurchaseStatus(lines), "received");
});

// A zero-qtyOrdered line can never satisfy "qtyOrdered > 0", so status can't reach "received"
test("zero-qtyOrdered line blocks received status", () => {
  const lines = [
    { qtyOrdered: 10, qtyReceived: 10 },
    { qtyOrdered: 0, qtyReceived: 0 },
  ];
  assert.equal(derivePurchaseStatus(lines), "partial");
});

console.log("syncReceivedQtys");

// draft/ordered: never touched
test("draft/ordered status → no-op", () => {
  const lines = [
    { qtyOrdered: 10, qtyReceived: 0 } as PurchaseLineForFifo,
  ];
  syncReceivedQtys(lines, "draft");
  assert.equal(lines[0].qtyReceived, 0);
  syncReceivedQtys(lines, "ordered");
  assert.equal(lines[0].qtyReceived, 0);
});

// received + qtyReceived unset → filled from qtyOrdered
test("received status fills unset qtyReceived from qtyOrdered", () => {
  const lines = [
    { qtyOrdered: 10, qtyReceived: 0 } as PurchaseLineForFifo,
  ];
  syncReceivedQtys(lines, "received");
  assert.equal(lines[0].qtyReceived, 10);
});

// received + qtyReceived already set → left untouched
test("received status leaves already-set qtyReceived alone", () => {
  const lines = [
    { qtyOrdered: 10, qtyReceived: 4 } as PurchaseLineForFifo,
  ];
  syncReceivedQtys(lines, "received");
  assert.equal(lines[0].qtyReceived, 4);
});

// partial status: guard lets it through but no line is ever auto-filled
test("partial status never auto-fills qtyReceived", () => {
  const lines = [
    { qtyOrdered: 10, qtyReceived: 0 } as PurchaseLineForFifo,
  ];
  syncReceivedQtys(lines, "partial");
  assert.equal(lines[0].qtyReceived, 0);
});

console.log("averageLeadDays");

// No completed orders → null (caller must skip the update)
test("empty orders → null", () => {
  assert.equal(averageLeadDays([]), null);
});

// Single order: exact day gap
test("single order → exact day gap", () => {
  const avg = averageLeadDays([
    { date: "2026-01-01", receivedAt: "2026-01-06" },
  ]);
  assert.equal(avg, 5);
});

// Multiple orders → rounded mean of day gaps
test("multiple orders → rounded average", () => {
  const avg = averageLeadDays([
    { date: "2026-01-01", receivedAt: "2026-01-04" }, // 3 days
    { date: "2026-01-01", receivedAt: "2026-01-08" }, // 7 days
  ]);
  assert.equal(avg, 5); // (3 + 7) / 2 = 5
});

// Bad data where receivedAt precedes date must not produce negative lead time
test("receivedAt before date is clamped to 0, not negative", () => {
  const avg = averageLeadDays([
    { date: "2026-01-10", receivedAt: "2026-01-01" },
  ]);
  assert.equal(avg, 0);
});

function fakeAddFifoLayer() {
  const calls: Array<{
    productId: string;
    supplierId: string;
    supplierName: string;
    purchaseDate: Date;
    qty: number;
    unitCost: number;
    currency: string;
  }> = [];
  const fn = async (input: (typeof calls)[number]) => {
    calls.push(input);
    return {} as never;
  };
  return { fn, calls };
}

async function main() {
  console.log("applyFifoFromPurchase (injected addFifoLayer stub, no DB)");

  // All lines already fully FIFO-applied → delta <= 0 for every line, so
  // the injected addFifoLayer stub must never be called.
  await testAsync("no new receipt qty → returns empty, stub not called", async () => {
    const { fn, calls } = fakeAddFifoLayer();
    const po = {
      supplierId: "sup-1",
      supplierName: "Acme",
      date: new Date("2026-01-01"),
      currency: "AED",
      lines: [
        {
          productId: "p1",
          productName: "Ethanol",
          qtyOrdered: 10,
          qtyReceived: 10,
          qtyFifoApplied: 10,
          unitCost: 5,
        },
      ],
    };
    const touched = await applyFifoFromPurchase(po, { addFifoLayer: fn });
    assert.deepEqual(touched, []);
    assert.equal(calls.length, 0);
    assert.equal(po.lines[0].qtyFifoApplied, 10);
  });

  // New receipt qty → stub called once with the delta (not the full qty),
  // and qtyFifoApplied / touched reflect that call.
  await testAsync("new receipt qty → stub called with delta, state updated", async () => {
    const { fn, calls } = fakeAddFifoLayer();
    const po = {
      supplierId: "sup-1",
      supplierName: "Acme",
      date: new Date("2026-01-01"),
      currency: "AED",
      lines: [
        {
          productId: "p1",
          productName: "Ethanol",
          qtyOrdered: 10,
          qtyReceived: 10,
          qtyFifoApplied: 4, // 4 already applied earlier → delta is 6
          unitCost: 5,
        },
      ],
    };
    const touched = await applyFifoFromPurchase(po, { addFifoLayer: fn });
    assert.deepEqual(touched, ["p1"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].qty, 6);
    assert.equal(calls[0].productId, "p1");
    assert.equal(calls[0].supplierId, "sup-1");
    assert.equal(calls[0].unitCost, 5);
    assert.equal(calls[0].currency, "AED");
    assert.equal(po.lines[0].qtyFifoApplied, 10);
  });

  // Mixed lines: stub is called only for lines with a positive delta.
  await testAsync("mixed lines → stub called only for positive-delta lines", async () => {
    const { fn, calls } = fakeAddFifoLayer();
    const po = {
      supplierId: "sup-1",
      supplierName: "Acme",
      date: new Date("2026-01-01"),
      currency: "AED",
      lines: [
        {
          productId: "p1",
          productName: "Ethanol",
          qtyOrdered: 10,
          qtyReceived: 10,
          qtyFifoApplied: 10, // no delta
          unitCost: 5,
        },
        {
          productId: "p2",
          productName: "Fixative",
          qtyOrdered: 5,
          qtyReceived: 5,
          qtyFifoApplied: 0, // delta 5
          unitCost: 2,
        },
      ],
    };
    const touched = await applyFifoFromPurchase(po, { addFifoLayer: fn });
    assert.deepEqual(touched, ["p2"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].productId, "p2");
    assert.equal(calls[0].qty, 5);
  });

  // Malformed/negative qty fields coerce to 0 and also skip the stub call.
  await testAsync("NaN/negative qty fields coerce to 0 → stub not called", async () => {
    const { fn, calls } = fakeAddFifoLayer();
    const po = {
      supplierId: "sup-1",
      supplierName: "Acme",
      date: new Date("2026-01-01"),
      currency: "AED",
      lines: [
        {
          productId: "p2",
          productName: "Fixative",
          qtyOrdered: 5,
          qtyReceived: Number.NaN,
          qtyFifoApplied: -3,
          unitCost: 2,
        },
      ],
    };
    const touched = await applyFifoFromPurchase(po, { addFifoLayer: fn });
    assert.deepEqual(touched, []);
    assert.equal(calls.length, 0);
  });

  console.log("recalcSupplierAvgLeadDays (injected query/update stubs, no DB)");

  // Completed orders → avg computed and passed to the update stub.
  await testAsync("computes avg and calls update stub once", async () => {
    const updateCalls: Array<{ supplierId: string; avgLeadDays: number }> = [];
    await recalcSupplierAvgLeadDays("sup-1", {
      loadCompletedOrders: async () => [
        { date: "2026-01-01" as unknown as Date, receivedAt: "2026-01-04" as unknown as Date }, // 3 days
        { date: "2026-01-01" as unknown as Date, receivedAt: "2026-01-08" as unknown as Date }, // 7 days
      ],
      updateAvgLeadDays: async (supplierId, avgLeadDays) => {
        updateCalls.push({ supplierId, avgLeadDays });
      },
    });
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].supplierId, "sup-1");
    assert.equal(updateCalls[0].avgLeadDays, 5); // (3 + 7) / 2
  });

  // No completed orders → update stub must never be called.
  await testAsync("no completed orders → update stub not called", async () => {
    const updateCalls: Array<{ supplierId: string; avgLeadDays: number }> = [];
    await recalcSupplierAvgLeadDays("sup-1", {
      loadCompletedOrders: async () => [],
      updateAvgLeadDays: async (supplierId, avgLeadDays) => {
        updateCalls.push({ supplierId, avgLeadDays });
      },
    });
    assert.equal(updateCalls.length, 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();

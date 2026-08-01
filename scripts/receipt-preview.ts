import { writeFileSync } from "node:fs";
import { buildReceiptDoc } from "../src/lib/receipt/document";
import { renderReceiptHtml } from "../src/lib/receipt/template";
import { receiptSmsText, receiptText } from "../src/lib/receipt/text";

/** Renders sample receipts to /tmp so the print layouts can be eyeballed without a sale. */
const settings = {
  branchName: "Main Store — Dubai",
  currency: "AED",
  invoiceLanguages: "English + Arabic",
  storeLegalName: "UNICH Perfumes LLC",
  storeAddress: "Shop 12, Gold Souk Extension, Deira — Dubai, UAE",
  storePhone: "+971 4 000 0000",
  storeTaxNumber: "100123456700003",
  receiptFooter: "Thank you for shopping with UNICH · Exchange within 7 days.",
  vatPercent: 5,
};

const doc = buildReceiptDoc({
  saleId: "665f1c2a9b4e7d8a12ab34cd",
  issuedAt: new Date("2026-08-01T15:42:00"),
  customer: { name: "Fatima Al Marri", phone: "+971501234567" },
  salesperson: "Ahmad Ibrahim",
  payment: "card",
  lines: [
    { name: "Oud Royale 50ml", qty: 1, unitLabel: "pcs", unitPrice: 480 },
    { name: "Musk Al Tahara", qty: 2, unitLabel: "1 Tola", unitPrice: 96 },
    {
      name: "Custom Remix",
      qty: 1,
      unitLabel: "pcs",
      unitPrice: 250,
      note: "Oil: Amber Noir",
    },
  ],
  settings,
});

for (const format of ["thermal", "a4"] as const) {
  const path = `/tmp/receipt-${format}.html`;
  writeFileSync(path, renderReceiptHtml(doc, format));
  console.log(`wrote ${path}`);
}

console.log(`\nreceiptNo: ${doc.receiptNo}`);
console.log(
  `subtotal ${doc.subtotal} + vat ${doc.vatAmount} = total ${doc.total}`,
);
console.log(`\n--- WhatsApp / email text ---\n${receiptText(doc)}`);
console.log(`\n--- SMS ---\n${receiptSmsText(doc)}`);

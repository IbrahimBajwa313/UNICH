import type { Formula, FormulaComponent } from "@/lib/types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function componentRows(components: FormulaComponent[]): string {
  if (!components.length) {
    return `<tr><td colspan="4">No components</td></tr>`;
  }
  return components
    .map(
      (c) => `
      <tr>
        <td>${esc(c.productName)}</td>
        <td class="mono">${esc(c.productId)}</td>
        <td class="num">${esc(c.qty)}</td>
        <td>${esc(c.unit)}</td>
      </tr>`,
    )
    .join("");
}

/** Printable / exportable recipe HTML (BLD-04 print & export). */
export function buildRecipeHtml(formula: Formula): string {
  const title = formula.name || "Untitled formula";
  const approved =
    formula.status === "approved"
      ? `Approved by ${esc(formula.approvedBy || "Admin")}${
          formula.approvedAt ? ` · ${esc(formula.approvedAt)}` : ""
        }`
      : `Status: ${esc(formula.status)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — Formula</title>
  <style>
    @page { margin: 16mm; }
    body {
      font-family: "Segoe UI", Georgia, serif;
      color: #1a1a1a;
      margin: 0;
      padding: 24px;
      line-height: 1.45;
    }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 20px; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #bbb;
      border-radius: 999px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; font-size: 13px; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: ui-monospace, monospace; font-size: 11px; color: #666; }
    .notes { margin-top: 20px; padding: 12px; background: #f6f4f0; border-radius: 8px; font-size: 13px; }
    .foot { margin-top: 28px; font-size: 10px; color: #888; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="badge">${esc(formula.type)} · v${esc(formula.version || 1)}</p>
  <h1>${esc(title)}</h1>
  <p class="meta">
    ${approved}
    ${formula.customerName ? ` · Customer: ${esc(formula.customerName)}` : ""}
    · Yield: ${esc(formula.yieldMl)} ml
  </p>
  <table>
    <thead>
      <tr>
        <th>Component</th>
        <th>Product ID</th>
        <th class="num">Qty</th>
        <th>Unit</th>
      </tr>
    </thead>
    <tbody>
      ${componentRows(formula.components || [])}
    </tbody>
  </table>
  ${
    formula.notes
      ? `<div class="notes"><strong>Notes</strong><br/>${esc(formula.notes)}</div>`
      : ""
  }
  <p class="foot">UNICH · Formula confidentiality (BLD-04) · Admin export/print only</p>
</body>
</html>`;
}

"use client";

import type { ReceiptFormat } from "./types";

/**
 * Sends a fully-rendered receipt document to the OS print pipeline through a
 * hidden iframe, so an 80mm thermal printer (or A4 / Save-as-PDF) can be picked
 * in the browser print dialog.
 */
export function printHtmlDocument(html: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Printing is only available in the browser"));
  }

  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";

    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => frame.remove(), 1000);
      if (error) reject(error);
      else resolve();
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        finish(new Error("Print frame could not be created"));
        return;
      }
      // Chromium doesn't reliably shrink `@page { size: 80mm auto }` to the
      // content — it falls back to a full Letter/A4-length page, leaving a
      // large blank strip below the receipt. Measuring the rendered content
      // and pinning an explicit page height (which browsers DO honor) fixes it.
      if (win.document.body?.classList.contains("thermal")) {
        const contentPx = win.document.documentElement.scrollHeight;
        const contentMm = Math.ceil((contentPx * 25.4) / 96) + 6; // + 3mm top/bottom @page margin
        const style = win.document.createElement("style");
        style.textContent = `@page { size: 80mm ${contentMm}mm; }`;
        win.document.head.appendChild(style);
      }
      win.onafterprint = () => finish();
      try {
        win.focus();
        win.print();
        // Desktop browsers block on print(); mobile ones rely on onafterprint.
        finish();
      } catch (err) {
        finish(err instanceof Error ? err : new Error("Print failed"));
      }
    };

    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

export async function fetchReceiptHtml(
  path: string,
  init?: RequestInit,
): Promise<string> {
  const res = await fetch(path, { cache: "no-store", ...init });
  const body = await res.text();
  if (!res.ok) {
    let message = `Receipt request failed (${res.status})`;
    try {
      message = (JSON.parse(body).error as string) || message;
    } catch {
      // non-JSON error body — keep the status message
    }
    throw new Error(message);
  }
  return body;
}

export async function printSaleReceipt(
  saleId: string,
  format: ReceiptFormat,
  options?: { reprint?: boolean },
): Promise<void> {
  const params = new URLSearchParams({ format });
  if (options?.reprint) params.set("reprint", "1");
  const html = await fetchReceiptHtml(
    `/api/sales/${saleId}/receipt?${params.toString()}`,
  );
  await printHtmlDocument(html);
}

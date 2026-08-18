"use client";

import { useId, useMemo, useState } from "react";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";

type Granularity = "week" | "month" | "year";

const GRANULARITY_LABEL: Record<Granularity, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
};

const VIEW_W = 600;
const VIEW_H = 180;
const PAD_TOP = 20;
const PAD_BOTTOM = 10;
const PAD_RIGHT = 54;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Smooth S-curve through points — horizontal-midpoint control points, no overshoot. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX.toFixed(2)} ${p0.y.toFixed(2)}, ${midX.toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

function buildBuckets(purchases: PurchaseOrder[], granularity: Granularity) {
  const count = granularity === "week" ? 8 : granularity === "month" ? 6 : 4;
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const buckets = Array.from({ length: count }).map((_, i) => {
    const offset = count - 1 - i;
    let start: Date;
    let end: Date;
    let label: string;
    if (granularity === "week") {
      end = new Date(today);
      end.setDate(end.getDate() - offset * 7);
      start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      label = start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    } else if (granularity === "month") {
      const base = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      start = new Date(base.getFullYear(), base.getMonth(), 1);
      end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
      label = start.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
    } else {
      const year = today.getFullYear() - offset;
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31, 23, 59, 59, 999);
      label = String(year);
    }
    return { label, start, end, received: 0, pending: 0 };
  });

  for (const po of purchases) {
    if (!po.date) continue;
    const d = new Date(po.date);
    const bucket = buckets.find((b) => d >= b.start && d <= b.end);
    if (!bucket) continue;
    const receivedValue = (po.lines || []).reduce((s, l) => s + l.qtyReceived * l.unitCost, 0);
    bucket.received += receivedValue;
    bucket.pending += Math.max(0, po.total - receivedValue);
  }

  return buckets.map((b) => ({
    label: b.label,
    received: round2(b.received),
    pending: round2(b.pending),
  }));
}

/**
 * Smooth-curve trend for purchase value, styled after a reference "revenue
 * over time" card the user liked — kept on this app's own gold/mist theme
 * (no imported colors). Solid gold + filled area = Received (already in
 * stock); dotted muted line = Pending (still owed).
 */
export function PurchaseSpendTrendChart({ purchases }: { purchases: PurchaseOrder[] }) {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const gradientId = useId();

  const buckets = useMemo(() => buildBuckets(purchases, granularity), [purchases, granularity]);

  const totalReceived = buckets.reduce((s, b) => s + b.received, 0);
  const totalPending = buckets.reduce((s, b) => s + b.pending, 0);

  const half = Math.max(1, Math.floor(buckets.length / 2));
  const earlierReceived = buckets.slice(0, half).reduce((s, b) => s + b.received, 0);
  const recentReceived = buckets.slice(half).reduce((s, b) => s + b.received, 0);
  const trendPct =
    earlierReceived > 0 ? Math.round(((recentReceived - earlierReceived) / earlierReceived) * 1000) / 10 : null;

  const maxValue = Math.max(1, ...buckets.map((b) => b.received), ...buckets.map((b) => b.pending));
  const n = buckets.length;
  const baselineY = VIEW_H - PAD_BOTTOM;

  const xAt = (i: number) =>
    n === 1 ? (VIEW_W - PAD_RIGHT) / 2 : (i / (n - 1)) * (VIEW_W - PAD_RIGHT);
  const yAt = (value: number) =>
    PAD_TOP + (1 - value / maxValue) * (VIEW_H - PAD_TOP - PAD_BOTTOM);

  const receivedPoints = buckets.map((b, i) => ({ x: xAt(i), y: yAt(b.received) }));
  const pendingPoints = buckets.map((b, i) => ({ x: xAt(i), y: yAt(b.pending) }));

  const receivedLine = smoothPath(receivedPoints);
  const receivedArea =
    receivedPoints.length > 0
      ? `${receivedLine} L ${receivedPoints[receivedPoints.length - 1].x.toFixed(2)} ${baselineY} L ${receivedPoints[0].x.toFixed(2)} ${baselineY} Z`
      : "";
  const pendingLine = smoothPath(pendingPoints);

  const hasData = buckets.some((b) => b.received + b.pending > 0);
  const lastReceived = receivedPoints[receivedPoints.length - 1];
  const lastPending = pendingPoints[pendingPoints.length - 1];

  // Keep the two end-of-line value badges from stacking on top of each other
  // when received and pending land close together vertically.
  let receivedTopPct = lastReceived ? (lastReceived.y / VIEW_H) * 100 : 0;
  let pendingTopPct = lastPending ? (lastPending.y / VIEW_H) * 100 : 0;
  if (lastReceived && lastPending) {
    const MIN_GAP_PCT = 16;
    const gap = pendingTopPct - receivedTopPct;
    if (Math.abs(gap) < MIN_GAP_PCT) {
      const mid = (receivedTopPct + pendingTopPct) / 2;
      const half = MIN_GAP_PCT / 2;
      if (gap >= 0) {
        receivedTopPct = mid - half;
        pendingTopPct = mid + half;
      } else {
        receivedTopPct = mid + half;
        pendingTopPct = mid - half;
      }
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-ink">
              {formatMoney(totalReceived)}
            </p>
            <p className="text-xs uppercase tracking-wider text-ink-muted">Received</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-ink-soft">{formatMoney(totalPending)}</p>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wider text-ink-muted">
              Pending
              {trendPct !== null && (
                <span className={trendPct >= 0 ? "text-sage" : "text-coral"}>
                  {trendPct >= 0 ? "↑" : "↓"}
                  {Math.abs(trendPct)}%
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="inline-flex gap-1.5 rounded-full border border-line/70 bg-mist/60 p-1">
          {(["week", "month", "year"] as Granularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                granularity === g
                  ? "bg-gold text-white shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {GRANULARITY_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-44 items-center justify-center text-sm text-ink-muted">
          No purchases recorded for this period
        </div>
      ) : (
        <div className="relative mt-5" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {receivedArea && <path d={receivedArea} fill={`url(#${gradientId})`} stroke="none" />}

            {pendingLine && (
              <path
                d={pendingLine}
                fill="none"
                stroke="var(--color-ink-muted)"
                strokeWidth="2"
                strokeDasharray="3 5"
                strokeLinecap="round"
              />
            )}
            {pendingPoints.map((p, i) => (
              <circle key={`pend-${i}`} cx={p.x} cy={p.y} r="3.5" className="fill-mist stroke-ink-muted" strokeWidth="1.5" />
            ))}

            {receivedLine && (
              <path
                d={receivedLine}
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            )}
            {receivedPoints.map((p, i) => (
              <circle key={`recv-${i}`} cx={p.x} cy={p.y} r="4.5" className="fill-gold stroke-paper" strokeWidth="2.5" />
            ))}
          </svg>

          {lastReceived && (
            <span
              className="pointer-events-none absolute -translate-y-1/2 rounded-full border border-gold/50 bg-paper px-2 py-0.5 text-[10px] font-semibold text-gold-deep shadow-[var(--shadow-soft)]"
              style={{
                left: `${(lastReceived.x / VIEW_W) * 100}%`,
                top: `${receivedTopPct}%`,
                marginLeft: "10px",
              }}
            >
              {formatMoneyCompact(buckets[buckets.length - 1].received)}
            </span>
          )}
          {lastPending && (
            <span
              className="pointer-events-none absolute -translate-y-1/2 rounded-full border border-line-strong bg-paper px-2 py-0.5 text-[10px] font-medium text-ink-muted"
              style={{
                left: `${(lastPending.x / VIEW_W) * 100}%`,
                top: `${pendingTopPct}%`,
                marginLeft: "10px",
              }}
            >
              {formatMoneyCompact(buckets[buckets.length - 1].pending)}
            </span>
          )}
        </div>
      )}

      {hasData && (
        <div className="mt-2 flex gap-3" style={{ paddingLeft: 0 }}>
          {buckets.map((b, i) => (
            <span
              key={`${b.label}-${i}`}
              className="flex-1 text-center text-[11px] uppercase tracking-wider text-ink-muted"
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

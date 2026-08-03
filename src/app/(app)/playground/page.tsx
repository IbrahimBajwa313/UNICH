"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Factory,
  FileText,
  FlaskConical,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { moduleRoadmap } from "@/lib/constants";

const tracks = [
  {
    id: "pos",
    title: "POS & Sales",
    status: "ready" as const,
    href: "/pos",
    icon: ShoppingCart,
    points: [
      "Product search & quick buttons",
      "Cash / card / bank / credit / mixed",
      "Hold & resume bill",
      "Remix, oil-by-tola, refill flows",
      "Reuse customer formulas on repeat orders (BLD-08)",
      "Receipts: 80mm / A4 print, WhatsApp, email, SMS",
    ],
  },
  {
    id: "inventory",
    title: "Inventory FIFO",
    status: "ready" as const,
    href: "/inventory",
    icon: Boxes,
    points: [
      "Sellable / tester / sample / personal",
      "FIFO purchase + production layers",
      "Low stock thresholds",
      "ml ↔ tola conversions",
      "Excel import/export (staging + undo)",
    ],
  },
  {
    id: "bom",
    title: "Formula / BOM",
    status: "ready" as const,
    href: "/formulas",
    icon: FlaskConical,
    points: [
      "Remix BOM + packaging (bottle/cap/atomizer/collar/label/box/pouch)",
      "Customer formula vault",
      "Admin-only unlock",
      "Approve / reject / archive",
      "Version history + audit log",
      "Product picker + Oil/Ethanol/Fixative/Label/Box",
      "Units ml/g/kg/pcs + yield validation",
      "Search by name / customer / type",
    ],
  },
  {
    id: "production",
    title: "Production Orders",
    status: "ready" as const,
    href: "/production",
    icon: Factory,
    points: [
      "Generate order from approved formula",
      "Preview + consume formula ingredients",
      "Consume BOM packaging on produce",
      "FIFO deduction of materials",
      "Create finished-goods production batch",
    ],
  },
  {
    id: "purchase",
    title: "Purchasing",
    status: "ready" as const,
    href: "/purchases",
    icon: Truck,
    points: [
      "Supplier directory",
      "Multi-currency",
      "Credit & outstanding",
      "PO statuses",
      "FIFO layer on receipt",
    ],
  },
  {
    id: "crm",
    title: "CRM",
    status: "ready" as const,
    href: "/customers",
    icon: Users,
    points: [
      "Name · phone · preferences",
      "Purchase LTV",
      "Custom formulas link",
      "Credit balance",
      "Loyalty (future)",
    ],
  },
  {
    id: "quotes",
    title: "Quotations",
    status: "ready" as const,
    href: "/quotations",
    icon: FileText,
    points: [
      "Full status lifecycle",
      "Convert to invoice",
      "PDF stub",
      "WhatsApp stub",
      "No duplicate entry path",
    ],
  },
  {
    id: "reports",
    title: "Reporting",
    status: "shell" as const,
    href: "/reports",
    icon: ClipboardList,
    points: [
      "Sales / inventory / financial",
      "Dead stock flags",
      "Weekly & monthly packs",
      "Email / WhatsApp delivery next",
    ],
  },
];

export default function PlaygroundPage() {
  const { data: health, loading, error, reload } = useApiData<{ ok?: boolean; database?: string }>("/api/health");
  if (loading) return <LoadingState label="Checking database status…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader
        eyebrow="Prototype Lab"
        title="Feature Playground"
        description="This is the working shell for U-niche Perfumes ERP. Explore interactive prototypes, then we harden each module feature-by-feature toward go-live."
        actions={
          <Link href="/pos">
            <Button variant="gold">
              Start with POS
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <Panel className="mb-6 border-gold/25 bg-gradient-to-br from-gold/10 to-paper">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-deep">
              Client · U-niche Perfumes
            </p>
            <h2 className="mt-1 font-semibold text-2xl text-ink">
              Phase 1 · One-month go-live track
            </h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              Live MongoDB-backed ERP. Architecture is shaped for multi-branch,
              Shopify, payment gateways, and AI later without a redesign.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">7 interactive modules</Badge>
            <Badge tone={health?.ok ? "gold" : "danger"}>Database: {health?.ok ? "Connected" : "Unavailable"}</Badge>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tracks.map((track) => {
          const Icon = track.icon;
          return (
            <Panel key={track.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mist">
                  <Icon className="h-5 w-5 text-ink-soft" />
                </div>
                <Badge tone={track.status === "ready" ? "success" : "warning"}>
                  {track.status === "ready" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <CircleDashed className="h-3 w-3" />
                  )}
                  {track.status}
                </Badge>
              </div>
              <h3 className="mt-3 font-semibold text-xl text-ink">{track.title}</h3>
              <ul className="mt-3 flex-1 space-y-1.5">
                {track.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-ink-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    {p}
                  </li>
                ))}
              </ul>
              <Link href={track.href} className="mt-4">
                <Button variant="secondary" className="w-full" size="sm">
                  Open module
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-6">
        <h3 className="font-semibold text-xl text-ink">Suggested next build order</h3>
        <p className="mt-1 text-sm text-ink-muted">
          After you explore the playground, we implement these in sequence.
        </p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {moduleRoadmap.map((item, i) => (
            <li
              key={item.name}
              className="flex items-start gap-3 rounded-lg border border-line/70 bg-mist/30 px-3 py-2.5 text-sm"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-canvas">
                {i + 1}
              </span>
              <span>{item.name}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

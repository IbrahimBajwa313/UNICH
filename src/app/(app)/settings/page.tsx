"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { api } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

export default function SettingsPage() {
  const { data: draft, loading, error, reload, setData: setDraft } = useApiData<AppSettings>("/api/settings");
  async function save() { if (draft) { await api("/api/settings", { method: "PUT", body: JSON.stringify(draft) }); await reload(); } }
  if (loading || !draft) return <LoadingState label="Loading settings…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const roles = draft.roles || [];
  const integrations = draft.integrations || [];
  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Settings & RBAC"
        description="Role-based access, bilingual invoices (EN + AR), 3 decimal precision, branch defaults, and integration stubs for Phase 1 go-live."
        actions={<Button variant="gold" onClick={() => void save()}>Save Settings</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Access Roles" subtitle="Fine-grained permissions" />
          <ul className="space-y-3">
            {roles.map((r) => (
              <li
                key={r.role}
                className="rounded-lg border border-line/70 bg-mist/30 px-3 py-3"
              >
                <p className="font-medium">{r.role}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.access.map((a) => (
                    <Badge key={a} tone="neutral">
                      {a}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Store Defaults" subtitle={draft.branchName} />
            <dl className="space-y-3 text-sm">
              {(["branchName", "currency", "uiLanguage", "invoiceLanguages", "qtyPrecision", "inventoryMethod", "workingHours", "fridayHours", "minMarginGuard"] as const).map((field) => <EditableRow key={field} label={field.replace(/([A-Z])/g, " $1")} value={String(draft[field] ?? "")} onChange={(value) => setDraft({ ...draft, [field]: field === "qtyPrecision" ? Number(value) : value })} />)}
            </dl>
          </Panel>

          <Panel>
            <PanelHeader title="Integrations" subtitle="Roadmap hooks" />
            <ul className="space-y-2">
              {integrations.map((i) => (
                <li
                  key={i.name}
                  className="flex items-center justify-between rounded-lg border border-line/60 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{i.name}</span>
                  <Badge tone={i.status === "Planned" ? "info" : "neutral"}>
                    {i.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function EditableRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 pb-2 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd><input value={value} onChange={(e) => onChange(e.target.value)} className="w-40 border-b border-line bg-transparent text-right font-medium text-ink outline-none focus:border-gold" /></dd>
    </div>
  );
}

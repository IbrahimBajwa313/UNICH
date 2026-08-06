"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { UsersPanel } from "@/components/settings/UsersPanel";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/auth/roles";
import type { AppSettings, UserRole } from "@/lib/types";

function salespeopleFromDraft(draft: AppSettings) {
  return draft.salespeople?.length > 0
    ? draft.salespeople
    : [draft.currentUserName || "Ahmad Ibrahim"];
}

function activeFromDraft(draft: AppSettings, salespeople: string[]) {
  const active = (draft.activeSalesperson || "").trim();
  if (salespeople.includes(active)) return active;
  return salespeople[0] || draft.currentUserName || "Ahmad Ibrahim";
}

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const {
    data: draft,
    loading,
    error,
    reload,
    setData: setDraft,
  } = useApiData<AppSettings>("/api/settings");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [teamNames, setTeamNames] = useState<string[] | null>(null);
  const [activeSalesperson, setActiveSalesperson] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const savingRef = useRef(false);

  async function save() {
    if (!draft || savingRef.current) return;
    savingRef.current = true;
    setSaveMsg(null);
    try {
      const names =
        (teamNames && teamNames.length > 0
          ? teamNames
          : salespeopleFromDraft(draft)
        ).map((n) => n.trim()).filter(Boolean);
      const unique = Array.from(new Set(names));
      const finalNames =
        unique.length > 0
          ? unique
          : [draft.currentUserName || "Ahmad Ibrahim"];
      const selected =
        activeSalesperson && finalNames.includes(activeSalesperson)
          ? activeSalesperson
          : finalNames[0];

      const payload = {
        ...draft,
        salespeople: finalNames,
        activeSalesperson: selected,
      };
      delete (payload as { id?: string }).id;

      const saved = await api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const savedNames = salespeopleFromDraft(saved);
      setDraft(saved);
      setTeamNames(savedNames);
      setActiveSalesperson(activeFromDraft(saved, savedNames));
      setSourceId(saved.id);
      setSaveMsg(`Saved · Active: ${saved.activeSalesperson}`);
      window.setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      savingRef.current = false;
    }
  }

  function addName() {
    const name = newName.trim();
    if (!name) return;
    const current = teamNames ?? (draft ? salespeopleFromDraft(draft) : []);
    const exists = current.some((n) => n.toLowerCase() === name.toLowerCase());
    if (exists) {
      setNewName("");
      return;
    }
    const next = [...current, name];
    setTeamNames(next);
    if (!activeSalesperson) setActiveSalesperson(name);
    setNewName("");
  }

  function removeName(name: string) {
    const current = teamNames ?? (draft ? salespeopleFromDraft(draft) : []);
    const next = current.filter((n) => n !== name);
    setTeamNames(next);
    if (activeSalesperson === name) {
      setActiveSalesperson(next[0] || "");
    }
  }

  if (loading || !draft) return <LoadingState label="Loading settings…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (sourceId !== draft.id) {
    setSourceId(draft.id);
    const names = salespeopleFromDraft(draft);
    setTeamNames(names);
    setActiveSalesperson(activeFromDraft(draft, names));
  }

  const roles = draft.roles || [];
  const integrations = draft.integrations || [];
  const names =
    teamNames && teamNames.length > 0
      ? teamNames
      : salespeopleFromDraft(draft);
  const selectedActive =
    activeSalesperson && names.includes(activeSalesperson)
      ? activeSalesperson
      : names[0] || "";

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Settings & RBAC"
        description="User roles (Admin / Sales / Accounting), branch assignment, bilingual invoices, and store defaults."
        actions={
          hasPermission("settings:write") ? (
            <Button variant="gold" onClick={() => void save()}>
              Save Settings
            </Button>
          ) : null
        }
      />

      {saveMsg ? (
        <div className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm text-gold-deep">
          {saveMsg}
        </div>
      ) : null}

      <div className="mb-5">
        <UsersPanel />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Access Roles"
            subtitle="Enforced permissions (BRN-08)"
          />
          <ul className="space-y-3">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => {
              const seeded = roles.find(
                (r) => r.role === ROLE_LABELS[roleKey],
              );
              const perms = ROLE_PERMISSIONS[roleKey];
              return (
                <li
                  key={roleKey}
                  className="rounded-lg border border-line/70 bg-mist/30 px-3 py-3"
                >
                  <p className="font-medium">{ROLE_LABELS[roleKey]}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(seeded?.access?.length
                      ? seeded.access
                      : perms.slice(0, 6).map((p) => p.split(":")[0])
                    ).map((a) => (
                      <Badge key={a} tone="neutral">
                        {a}
                      </Badge>
                    ))}
                    <Badge tone="info">{perms.length} perms</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader
              title="Sales Team"
              subtitle="Add names → they appear in dropdown. Admin changes active person anytime."
            />

            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addName();
                  }
                }}
                placeholder="Add salesperson name…"
                className="h-10 flex-1 rounded-full border border-line bg-mist px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              />
              <Button type="button" variant="secondary" onClick={addName}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {names.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {names.map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-mist/50 px-2.5 py-1 text-sm"
                  >
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={() => removeName(name)}
                      className="text-ink-muted hover:text-coral"
                      title={`Remove ${name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">No salespeople yet — add a name.</p>
            )}

            <label className="mt-4 block">
              <span className="text-xs font-medium text-ink-muted">
                Active salesperson
              </span>
              <select
                value={selectedActive}
                onChange={(e) => setActiveSalesperson(e.target.value)}
                disabled={names.length === 0}
                className="mt-1.5 h-10 w-full rounded-full border border-line bg-mist px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:opacity-50"
              >
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-[11px] text-ink-muted">
                Jab admin aaye, yahan se change karein · Save Settings · POS pe yahi naam lagega.
              </span>
            </label>
          </Panel>

          <Panel>
            <PanelHeader title="Store Defaults" subtitle={draft.branchName} />
            <dl className="space-y-3 text-sm">
              {(
                [
                  "branchName",
                  "currency",
                  "uiLanguage",
                  "invoiceLanguages",
                  "qtyPrecision",
                  "inventoryMethod",
                  "workingHours",
                  "fridayHours",
                  "minMarginGuard",
                ] as const
              ).map((field) => (
                <EditableRow
                  key={field}
                  label={field.replace(/([A-Z])/g, " $1")}
                  value={String(draft[field] ?? "")}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      [field]: field === "qtyPrecision" ? Number(value) : value,
                    })
                  }
                />
              ))}
            </dl>
          </Panel>

          <Panel>
            <PanelHeader
              title="Receipt & Invoice"
              subtitle="Printed on thermal 80mm / A4 and attached to emailed receipts."
            />
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["storeLegalName", "Legal name"],
                  ["storeAddress", "Address"],
                  ["storePhone", "Receipt phone"],
                  ["storeTaxNumber", "TRN / Tax number"],
                  ["receiptLogoUrl", "Logo URL"],
                  ["receiptFooter", "Footer line"],
                ] as const
              ).map(([field, label]) => (
                <EditableRow
                  key={field}
                  label={label}
                  value={String(draft[field] ?? "")}
                  onChange={(value) => setDraft({ ...draft, [field]: value })}
                />
              ))}
              <EditableRow
                label="VAT % (price-inclusive)"
                value={String(draft.vatPercent ?? 0)}
                onChange={(value) =>
                  setDraft({ ...draft, vatPercent: Number(value) || 0 })
                }
              />
              <div className="flex items-center justify-between gap-4 border-b border-line/50 pb-2">
                <dt className="text-ink-muted">Default print format</dt>
                <dd>
                  <select
                    value={draft.receiptFormat ?? "thermal"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        receiptFormat: e.target.value as "thermal" | "a4",
                      })
                    }
                    className="rounded border border-line bg-mist px-2 py-1 text-sm"
                  >
                    <option value="thermal">Thermal 80mm</option>
                    <option value="a4">A4</option>
                  </select>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-muted">
                  POS “Print after complete” preference
                  <span className="mt-0.5 block text-[11px] font-normal text-ink-muted/80">
                    Synced when you tick the box on POS. Print never runs unless that POS box is checked at checkout.
                  </span>
                </dt>
                <dd>
                  <input
                    type="checkbox"
                    checked={draft.autoPrintReceipt === true}
                    onChange={(e) =>
                      setDraft({ ...draft, autoPrintReceipt: e.target.checked })
                    }
                    className="h-4 w-4 accent-[var(--gold,#b8912f)]"
                  />
                </dd>
              </div>
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

function EditableRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 pb-2 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-40 border-b border-line bg-transparent text-right font-medium text-ink outline-none focus:border-gold"
        />
      </dd>
    </div>
  );
}

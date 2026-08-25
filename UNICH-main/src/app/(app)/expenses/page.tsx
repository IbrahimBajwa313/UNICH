"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Expense } from "@/lib/types";

export default function ExpensesPage() {
  const { data: expenses, loading, error, reload } = useApiData<Expense[]>("/api/expenses");
  const [draft, setDraft] = useState<Partial<Expense> | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "Wastage">("all");
  const rows = (expenses ?? []).filter((e) =>
    categoryFilter === "all" ? true : e.category === "Wastage",
  );
  const allRows = expenses ?? [];
  const total = rows.reduce((sum, expense) => sum + expense.amount, 0);
  const wastageTotal = allRows
    .filter((e) => e.category === "Wastage")
    .reduce((sum, e) => sum + e.amount, 0);
  async function save() {
    if (!draft?.category || !draft.detail || !draft.amount) return;
    await api(draft.id ? `/api/expenses/${draft.id}` : "/api/expenses", { method: draft.id ? "PUT" : "POST", body: JSON.stringify({ ...draft, amount: Number(draft.amount) }) });
    setDraft(null); await reload();
  }
  async function remove(id: string) { await api(`/api/expenses/${id}`, { method: "DELETE" }); await reload(); }
  if (loading) return <LoadingState label="Loading expenses…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Expenses & Cash Closing"
        description="Business expenses, petty cash, daily cash closing, approvals, and receipt capture. Detailed budgeting rules TBD with client."
        actions={<Button variant="gold" onClick={() => setDraft({ date: new Date().toISOString().slice(0, 10), status: "pending" })}>Log Expense</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Recorded Expenses" value={formatMoney(total)} />
        <Stat label="Expense Entries" value={String(rows.length)} />
        <Stat
          label="Damage / Wastage"
          value={formatMoney(wastageTotal)}
          hint="INV-07 cost wastage"
        />
      </div>

      <Panel className="mt-6" padding={false}>
        <div className="border-b border-line/70 px-5 py-4">
          <PanelHeader
            title="Recent Expenses"
            subtitle="Filter damage/wastage for admin tracking"
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={categoryFilter === "all" ? "gold" : "secondary"}
                  onClick={() => setCategoryFilter("all")}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={categoryFilter === "Wastage" ? "gold" : "secondary"}
                  onClick={() => setCategoryFilter("Wastage")}
                >
                  Damage / Wastage
                </Button>
              </div>
            }
          />
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-mist/70 text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-5 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Detail</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-line/60">
                <td className="px-5 py-3 text-ink-muted">{e.date}</td>
                <td className="px-3 py-3 font-medium">{e.category}</td>
                <td className="px-3 py-3 text-ink-muted">{e.detail}</td>
                <td className="px-3 py-3">
                  <Badge tone={e.status === "approved" ? "success" : "warning"}>
                    {e.status}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-right font-medium">
                  <div className="flex items-center justify-end gap-2">{formatMoney(e.amount)}<Button size="sm" variant="ghost" onClick={() => setDraft(e)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => void remove(e.id)}>Delete</Button></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {draft ? <Panel className="mt-5"><PanelHeader title={draft.id ? "Edit Expense" : "Log Expense"} subtitle="Expense details" /><div className="grid gap-3 sm:grid-cols-4"><ExpenseInput label="Date" value={draft.date || ""} onChange={(date) => setDraft({ ...draft, date })} /><ExpenseInput label="Category" value={draft.category || ""} onChange={(category) => setDraft({ ...draft, category })} /><ExpenseInput label="Detail" value={draft.detail || ""} onChange={(detail) => setDraft({ ...draft, detail })} /><ExpenseInput label="Amount" value={String(draft.amount || "")} onChange={(amount) => setDraft({ ...draft, amount: Number(amount) })} /></div><div className="mt-3 flex gap-2"><Button onClick={save}>Save Expense</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div></Panel> : null}
    </div>
  );
}

function ExpenseInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-ink-muted">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded border border-line bg-mist px-2 text-sm" /></label>; }

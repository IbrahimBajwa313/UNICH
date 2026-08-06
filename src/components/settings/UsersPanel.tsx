"use client";

import { useState } from "react";
import { Plus, Pencil, UserX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, useApiData } from "@/components/ui/DataState";
import { Input } from "@/components/ui/Input";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import type { AppUser, Branch, UserRole } from "@/lib/types";

type Draft = {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branchId: string;
  active: boolean;
};

const emptyDraft = (): Draft => ({
  name: "",
  email: "",
  password: "",
  role: "sales",
  branchId: "",
  active: true,
});

export function UsersPanel() {
  const { hasPermission, user: me } = useAuth();
  const canRead = hasPermission("users:read");
  const canWrite = hasPermission("users:write");
  const {
    data: users,
    loading,
    error,
    reload,
    setData,
  } = useApiData<AppUser[]>(canRead ? "/api/users" : null);
  const { data: branches } = useApiData<Branch[]>(
    canRead ? "/api/branches" : null,
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canRead) {
    return (
      <Panel>
        <PanelHeader title="Users" subtitle="Admin only" />
        <p className="text-sm text-ink-muted">
          You do not have permission to manage users.
        </p>
      </Panel>
    );
  }

  if (loading || !users) return <LoadingState label="Loading users…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const branchList = branches || [];

  async function save() {
    if (!draft || !canWrite) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        name: draft.name.trim(),
        email: draft.email.trim(),
        role: draft.role,
        branchId: draft.branchId || null,
        active: draft.active,
      };
      if (draft.password.trim()) payload.password = draft.password.trim();

      if (draft.id) {
        if (!draft.password.trim()) delete payload.password;
        const updated = await api<AppUser>(`/api/users/${draft.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setData((prev) =>
          (prev || []).map((u) => (u.id === updated.id ? updated : u)),
        );
        setMsg(`Updated ${updated.name}`);
      } else {
        if (!draft.password.trim()) {
          setMsg("Password is required for new users.");
          setBusy(false);
          return;
        }
        const created = await api<AppUser>("/api/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setData((prev) => [created, ...(prev || [])]);
        setMsg(`Created ${created.name}`);
      }
      setDraft(null);
      window.setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(user: AppUser) {
    if (!canWrite) return;
    if (user.id === me?.id) {
      setMsg("You cannot deactivate yourself.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      setData((prev) =>
        (prev || []).map((u) =>
          u.id === user.id ? { ...u, active: false } : u,
        ),
      );
      setMsg(`Deactivated ${user.name}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(user: AppUser) {
    setDraft({
      id: user.id,
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      branchId: user.branchId || "",
      active: user.active,
    });
  }

  return (
    <Panel>
      <PanelHeader
        title="User management"
        subtitle="Assign role + branch (BRN-08)"
        action={
          canWrite ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setDraft({
                  ...emptyDraft(),
                  branchId: branchList[0]?.id || me?.branchId || "",
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add user
            </Button>
          ) : null
        }
      />

      {msg ? (
        <div className="mb-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold-deep">
          {msg}
        </div>
      ) : null}

      {draft ? (
        <div className="mb-4 space-y-3 rounded-xl border border-line bg-mist/40 p-4">
          <p className="text-sm font-medium text-ink">
            {draft.id ? "Edit user" : "New user"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Input
              label={draft.id ? "New password (optional)" : "Password"}
              type="password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            />
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-muted">Role</span>
              <select
                value={draft.role}
                onChange={(e) =>
                  setDraft({ ...draft, role: e.target.value as UserRole })
                }
                className="h-10 w-full rounded-full border border-line bg-mist px-4 text-sm outline-none focus:border-gold"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-muted">Branch</span>
              <select
                value={draft.branchId}
                onChange={(e) =>
                  setDraft({ ...draft, branchId: e.target.value })
                }
                className="h-10 w-full rounded-full border border-line bg-mist px-4 text-sm outline-none focus:border-gold"
              >
                <option value="">— None (Super Admin) —</option>
                {branchList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
                className="h-4 w-4 accent-[var(--gold,#b8912f)]"
              />
              Active
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="gold" size="sm" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-2">
        {users.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/70 bg-mist/30 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {u.name}{" "}
                <span className="font-normal text-ink-muted">· {u.email}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone="gold">{u.roleLabel}</Badge>
                {u.branchName ? (
                  <Badge tone="neutral">{u.branchName}</Badge>
                ) : (
                  <Badge tone="info">All branches</Badge>
                )}
                {!u.active ? <Badge tone="danger">Inactive</Badge> : null}
              </div>
            </div>
            {canWrite ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded-full p-2 text-ink-muted hover:bg-paper hover:text-ink"
                  title="Edit"
                  onClick={() => startEdit(u)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {u.active ? (
                  <button
                    type="button"
                    className="rounded-full p-2 text-ink-muted hover:bg-paper hover:text-coral"
                    title="Deactivate"
                    onClick={() => void deactivate(u)}
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

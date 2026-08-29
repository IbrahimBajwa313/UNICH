import type { UserRole } from "@/lib/types";
import { canAccessReportCategory } from "./access";
import type { ReportDefinition } from "./types";

const registry = new Map<string, ReportDefinition>();

/** Called once per report module at import time — see `reports/index.ts`. */
export function registerReport(definition: ReportDefinition): void {
  if (registry.has(definition.id)) {
    throw new Error(`Report "${definition.id}" is already registered.`);
  }
  registry.set(definition.id, definition);
}

export function getReport(id: string): ReportDefinition | null {
  return registry.get(id) ?? null;
}

export function listReportsForRole(role: UserRole): ReportDefinition[] {
  return Array.from(registry.values()).filter((def) =>
    canAccessReportCategory(role, def.category),
  );
}

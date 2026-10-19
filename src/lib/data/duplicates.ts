/**
 * Possible-duplicate detection for the CRM (pure, unit-tested).
 *
 * Two evidence levels, both surfaced in the UI as "possible" — a human
 * decides; nothing is merged or deleted automatically:
 *
 *   "email"         — same normalized email (trimmed, lowercased). The
 *                     database unique index normally prevents these;
 *                     they can still appear in demo data or after
 *                     imports that bypassed validation.
 *   "name_company"  — same full name AND same company (normalized) but
 *                     different emails — the classic re-imported or
 *                     re-typed record.
 */

import type { Lead } from "@/types";

export type DuplicateReason = "email" | "name_company";

export interface DuplicateGroup {
  reason: DuplicateReason;
  /** The normalized key the group matched on. */
  key: string;
  leads: Lead[];
}

function norm(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeEmail(email: string | undefined | null): string {
  return norm(email);
}

export function findDuplicateGroups(leads: Lead[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();

  // Pass 1 — exact email matches (strongest evidence).
  const byEmail = new Map<string, Lead[]>();
  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (!email) continue;
    const arr = byEmail.get(email) ?? [];
    arr.push(lead);
    byEmail.set(email, arr);
  }
  byEmail.forEach((members, key) => {
    if (members.length < 2) return;
    members.forEach((m) => claimed.add(m.id));
    groups.push({ reason: "email", key, leads: members });
  });

  // Pass 2 — same name + company among leads not already in an email group.
  const byNameCompany = new Map<string, Lead[]>();
  for (const lead of leads) {
    if (claimed.has(lead.id)) continue;
    const name = norm(`${lead.first_name ?? ""} ${lead.last_name ?? ""}`);
    const company = norm(lead.company);
    if (!name || !company) continue;
    const key = `${name} @ ${company}`;
    const arr = byNameCompany.get(key) ?? [];
    arr.push(lead);
    byNameCompany.set(key, arr);
  }
  byNameCompany.forEach((members, key) => {
    if (members.length < 2) return;
    groups.push({ reason: "name_company", key, leads: members });
  });

  return groups;
}

/** Count of leads involved in any duplicate group (for badges/panels). */
export function countDuplicatedLeads(groups: DuplicateGroup[]): number {
  return groups.reduce((sum, g) => sum + g.leads.length, 0);
}

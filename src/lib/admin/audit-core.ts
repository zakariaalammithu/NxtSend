/**
 * Audit logs — pure core (entry shape + filtering).
 *
 * The substrate is the real `audit_logs` table (migration 001), written
 * by admin API routes through the service role (user suspend/activate,
 * settings changes, the bootstrap route). In Demo Mode the same shape is
 * served from a labelled in-process store seeded with the sample
 * dataset. The previous admin Audit page rendered the bundled mock
 * directly and never saw the entries the APIs actually write — this
 * module + GET /api/admin/audit-logs fix that.
 */

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  /** Inclusive ISO date (YYYY-MM-DD) lower bound. */
  from?: string;
  /** Inclusive ISO date (YYYY-MM-DD) upper bound. */
  to?: string;
  search?: string;
}

export function filterAuditEntries(
  entries: AuditEntry[],
  filters: AuditFilters
): AuditEntry[] {
  const search = filters.search?.trim().toLowerCase();
  const actor = filters.actor?.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.action && filters.action !== "all" && entry.action !== filters.action) {
      return false;
    }
    if (actor && !entry.actor.toLowerCase().includes(actor)) return false;
    const day = entry.created_at.slice(0, 10);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    if (search) {
      const haystack =
        `${entry.actor} ${entry.action} ${entry.resource ?? ""} ${entry.details}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/** Shapes a raw audit_logs row (+ optional actor email) into an AuditEntry. */
export function shapeAuditRow(
  row: Record<string, unknown>,
  actorEmail?: string | null
): AuditEntry {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const details =
    (typeof metadata.details === "string" && metadata.details) ||
    (typeof metadata.actor_email === "string" &&
      `Performed by ${metadata.actor_email}`) ||
    "";
  return {
    id: String(row.id),
    actor:
      actorEmail ??
      (typeof metadata.actor_email === "string" ? metadata.actor_email : "system"),
    action: String(row.action ?? "UNKNOWN"),
    resource: (row.resource as string | null) ?? null,
    details,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

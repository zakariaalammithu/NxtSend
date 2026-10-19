/**
 * System Health — pure core (check model + overall aggregation).
 *
 * The honesty rule this module exists to enforce: the admin System
 * Health page must NEVER present an overall "Healthy" while any
 * REQUIRED check has failed or is unknown. Aggregation is a pure
 * function so the rule is unit-tested directly:
 *   - any required check with status "fail" or "unknown"
 *       → overall "issues"        (banner: "Issues found")
 *   - else any check not "ok" (warnings, optional failures)
 *       → overall "not_configured" (banner: "Not fully configured")
 *   - else → overall "healthy"    (banner: "Healthy")
 */

export type HealthCheckStatus = "ok" | "warning" | "fail" | "unknown";

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthCheckStatus;
  /** Required checks gate the overall verdict (see header). */
  required: boolean;
  message: string;
}

export type OverallHealth = "healthy" | "not_configured" | "issues";

export const OVERALL_HEALTH_LABELS: Record<OverallHealth, string> = {
  healthy: "Healthy",
  not_configured: "Not fully configured",
  issues: "Issues found",
};

export interface HealthSummary {
  overall: OverallHealth;
  label: string;
  checks: HealthCheck[];
  counts: { ok: number; warning: number; fail: number; unknown: number };
}

export function aggregateHealth(checks: HealthCheck[]): HealthSummary {
  const counts = { ok: 0, warning: 0, fail: 0, unknown: 0 };
  for (const check of checks) counts[check.status] += 1;

  const requiredBad = checks.some(
    (c) => c.required && (c.status === "fail" || c.status === "unknown")
  );
  const anyBad = checks.some((c) => c.status !== "ok");

  const overall: OverallHealth = requiredBad
    ? "issues"
    : anyBad
      ? "not_configured"
      : "healthy";

  return { overall, label: OVERALL_HEALTH_LABELS[overall], checks, counts };
}

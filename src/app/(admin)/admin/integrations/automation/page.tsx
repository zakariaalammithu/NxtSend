"use client";

/**
 * Automation — provider monitoring group page (Wave 2, Phase 2,
 * super-admin only). Covers all six REST platforms (Zapier, n8n,
 * Make, Pabbly, Albato, Activepieces) with grants, webhooks and
 * audit data; see ../monitoring/monitoring-ui.tsx. The existing
 * Zapier / n8n pages keep their deeper per-platform panels.
 */

import { GroupMonitoringPage } from "../monitoring/monitoring-ui";

export default function AutomationMonitoringPage() {
  return <GroupMonitoringPage slug="automation" />;
}

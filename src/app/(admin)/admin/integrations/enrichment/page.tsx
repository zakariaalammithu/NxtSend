"use client";

/**
 * Lead enrichment — provider monitoring group page (Wave 2, Phase 2,
 * super-admin only). Renders the monitoring overview filtered to
 * this provider group; see ../monitoring/monitoring-ui.tsx.
 */

import { GroupMonitoringPage } from "../monitoring/monitoring-ui";

export default function EnrichmentMonitoringPage() {
  return <GroupMonitoringPage slug="enrichment" />;
}

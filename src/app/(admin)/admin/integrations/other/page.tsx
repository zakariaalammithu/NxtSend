"use client";

import * as React from "react";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";

/**
 * Admin → Integrations → Other APIs. The remainder of the Integration
 * Center registry not covered by a dedicated admin page: platform
 * database, billing, outbound webhooks, background jobs, LinkedIn
 * (authorized-provider placeholder), Meta Pixel, and email
 * verification (not implemented). Full setup detail for each lives
 * in its workspace Integration Center page.
 */
export default function AdminOtherIntegrationsPage() {
  return (
    <AdminIntegrationView
      title="Other APIs"
      description="Every remaining registered integration with its derived status. Anything not implemented says so — a 'Not Connected' here is information, not an error."
      integrationIds={[
        "supabase",
        "stripe",
        "webhooks",
        "jobs",
        "linkedin",
        "meta-pixel",
        "crm",
        "email-verification",
      ]}
    />
  );
}

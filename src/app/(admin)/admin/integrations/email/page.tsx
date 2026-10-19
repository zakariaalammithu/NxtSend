"use client";

import * as React from "react";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";

/**
 * Admin → Integrations → Email / Resend. The sending provider's
 * platform view: derived status, last verification, webhook state
 * (registration URL + signing-secret presence via the env checklist).
 * Sending itself stays behind the adapter's guarantees — suppression
 * check before every send, "sent" only with a provider message ID.
 */
export default function AdminEmailIntegrationPage() {
  return (
    <AdminIntegrationView
      title="Email / Resend"
      description="Transactional and outreach email delivery via Resend. Delivery, bounce, and complaint events return through the signed Resend webhook and update message records; bounces and complaints also feed the suppression list."
      integrationIds={["resend"]}
    />
  );
}

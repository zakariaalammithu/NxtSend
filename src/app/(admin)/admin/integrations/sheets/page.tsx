"use client";

import * as React from "react";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";

/**
 * Admin → Integrations → Google Sheets. HONEST STATE: no Sheets
 * adapter exists in this codebase — no OAuth flow, no Sheets API
 * client, no sync. The registry says the same thing ("Not
 * Connected — not implemented"). Leads move in/out via CSV
 * import/export today; a Sheets integration would need a Google
 * OAuth app + Sheets API adapter that has not been built.
 */
export default function AdminSheetsIntegrationPage() {
  return (
    <AdminIntegrationView
      title="Google Sheets"
      description="Two-way lead sync with Google Sheets is not implemented. This page exists so the gap is visible and tracked rather than implied."
      integrationIds={["google-sheets"]}
    >
      <div className="glass-card p-6">
        <h2 className="text-16 font-bold text-white mb-2">What exists instead</h2>
        <p className="text-13 text-black-300">
          CSV import/export on the Leads page covers the same data movement
          manually today (real parser, column mapping, validation report,
          duplicate detection). Building Sheets sync requires: a Google Cloud
          OAuth client, the Sheets API adapter with per-workspace token
          storage, and a sync/conflict policy — none of which exist yet, so
          no part of this page pretends otherwise.
        </p>
      </div>
    </AdminIntegrationView>
  );
}

"use client";

import * as React from "react";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";

/**
 * Admin → System → Browser Automation. The platform's only
 * LinkedIn-related automation surface: the demo adapter. There is no
 * real browser automation (no Puppeteer/Playwright worker, no cookie
 * sessions, no scraping) and none will be added outside an
 * authorized, documented provider integration — credential-based
 * LinkedIn automation is explicitly out of scope for this platform.
 */
export default function AdminBrowserAutomationPage() {
  return (
    <AdminIntegrationView
      title="Browser Automation"
      description="LinkedIn outreach execution. Only a demo adapter exists: it simulates actions locally and its status reports an error rather than claiming a connection. Real execution requires an authorized LinkedIn provider integration, which is not connected."
      integrationIds={["linkedin"]}
    >
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Policy boundary (by design)</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>No credential collection: the app never asks for, stores, or replays LinkedIn passwords or session cookies.</li>
          <li>No CAPTCHA bypass, stealth browsing, or restriction-evasion tooling will be added.</li>
          <li>Sequence execution stays in Demo Mode (labelled simulated) until an authorized provider with a documented API is integrated.</li>
        </ul>
      </div>
    </AdminIntegrationView>
  );
}

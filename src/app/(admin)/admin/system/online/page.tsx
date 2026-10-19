"use client";

import * as React from "react";
import { AdminPageHeader } from "@/components/admin/AdminBits";

/**
 * Admin → System → Online. HONEST STATE: NxtSend has no presence
 * system. Authentication is Supabase Auth with cookie sessions; there
 * is no realtime channel, heartbeat, or session registry the admin
 * console could truthfully read "who is online" from. This page
 * documents the actual session model instead of faking a user list.
 */
export default function AdminOnlinePage() {
  return (
    <div className="space-y-6 pb-14 max-w-4xl">
      <AdminPageHeader
        title="Online"
        description="Live user presence is not tracked by this platform. There is no presence mechanism to read — this page explains the real session model."
        badge="No presence system"
      />

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">How sessions actually work</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>
            Users authenticate with <strong className="text-black-100">Supabase Auth</strong>;
            the browser holds a session cookie that the middleware refreshes on
            each request. There is no server-side session table in this
            application.
          </li>
          <li>
            A user is &ldquo;active&rdquo; only in the sense that their cookie has not
            expired — the app cannot distinguish &ldquo;looking at the dashboard
            right now&rdquo; from &ldquo;closed the tab an hour ago&rdquo;.
          </li>
          <li>
            Account-level control exists without presence: suspending a user
            (Admin → Users) blocks their next sign-in and immediately blocks
            admin API calls.
          </li>
        </ul>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What real presence would require</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>Supabase Realtime presence channels joined by the dashboard shell, or</li>
          <li>a heartbeat endpoint writing last-seen timestamps to a table the admin API can aggregate.</li>
        </ul>
        <p className="text-13 text-black-400">
          Neither is built. When one is, this page will read it — until then it
          shows this explanation rather than a fabricated &ldquo;online users&rdquo; list.
        </p>
      </div>
    </div>
  );
}

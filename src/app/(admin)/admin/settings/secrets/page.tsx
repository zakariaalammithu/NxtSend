"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import {
  AdminPageHeader,
  ErrorState,
  LoadingState,
  ModeNote,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { EnvPresence } from "@/lib/admin/platform-server";

interface HealthLikeResponse {
  mode: string;
  env: EnvPresence[];
}

/**
 * Admin → Security/Settings → Configure Secrets. Guidance only, by
 * design: this page lists every secret/configuration variable the
 * platform uses, where it is set (Vercel), and whether the running
 * server can see it. VALUES ARE NEVER SHOWN — the API returns presence
 * booleans only, and there is no code path that could render a secret
 * here. Rotating a secret means updating it in Vercel and redeploying.
 */
export default function AdminSecretsPage() {
  const { data, error, loading, reload } = useAdminFetch<HealthLikeResponse>(
    "/api/admin/health"
  );

  return (
    <div className="space-y-6 pb-14 max-w-5xl">
      <AdminPageHeader
        title="Configure Secrets"
        description="Every environment variable this platform reads, and whether the server currently has it. Secrets are configured in Vercel — never in this UI — and their values are never displayed anywhere in the admin console."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Checking configuration…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="glass-card p-6 space-y-3">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-purple-400" />
              <h2 className="text-16 font-bold text-white">How configuration works</h2>
            </div>
            <ol className="list-decimal pl-5 space-y-2 text-13 text-black-300">
              <li>
                Open <strong className="text-black-100">Vercel → your project → Settings → Environment Variables</strong>.
              </li>
              <li>
                Add each variable below for the environments that need it
                (Production, and Preview if you test with real providers).
                Server-only variables must never be renamed with a{" "}
                <span className="font-mono">NEXT_PUBLIC_</span> prefix — that
                would ship them to browsers.
              </li>
              <li>
                Redeploy after changing variables; running instances keep the
                values they started with.
              </li>
              <li>
                Rotate on suspicion of exposure and on a regular cadence:
                generate the new value at the provider, update Vercel,
                redeploy, then revoke the old value at the provider. The
                presence indicators below confirm the new value is live.
              </li>
              <li>
                <span className="font-mono">ADMIN_BOOTSTRAP_SECRET</span> is a
                one-time tool: remove it from Vercel as soon as the first
                super admin exists (the bootstrap route warns about this too).
              </li>
            </ol>
          </div>

          <div className="glass-card p-6 overflow-x-auto">
            <table className="w-full text-13">
              <thead>
                <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                  <th className="py-2 pr-4 font-semibold">Variable</th>
                  <th className="py-2 pr-4 font-semibold">Visibility</th>
                  <th className="py-2 pr-4 font-semibold">Purpose</th>
                  <th className="py-2 font-semibold">Server sees it</th>
                </tr>
              </thead>
              <tbody>
                {data.env.map((entry) => (
                  <tr key={entry.name} className="border-b border-black-800/60">
                    <td className="py-2.5 pr-4 font-mono text-12 text-black-100">
                      {entry.name}
                    </td>
                    <td className="py-2.5 pr-4 text-black-300">
                      {entry.visibility === "public" ? "Public (NEXT_PUBLIC_)" : "Server-only"}
                    </td>
                    <td className="py-2.5 pr-4 text-black-300">{entry.purpose}</td>
                    <td className="py-2.5">
                      <span
                        className={`text-11 font-bold uppercase tracking-wider ${
                          entry.present ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {entry.present ? "Set" : "Missing"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

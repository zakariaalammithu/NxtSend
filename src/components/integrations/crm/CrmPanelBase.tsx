/**
 * CRM panel base — shared presentational shell for the nine CRM
 * provider panels in this directory. NOT wired into any page; the
 * coordinator wires these in.
 *
 * Follows the N8nLivePanels pattern (connection status, health, last
 * sync, usage, activity, error log, disconnect) with one honesty
 * rule throughout: nothing here renders "Connected" unless the
 * stored health check says so, and every capability that is
 * config-ready (not live-verified) is labelled as such.
 *
 * All data arrives as props — this component fetches nothing and
 * holds no credentials.
 */

"use client";

import type { ProviderConnectionStatus } from "@/lib/integrations/providers/types";
import type { ProviderHealthResult } from "@/lib/integrations/providers/health";
import type { SyncJob } from "@/lib/integrations/providers/sync";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

export interface CrmPanelConnection {
  status: ProviderConnectionStatus;
  hasCredentials: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  credentialExpiresAt: string | null;
}

export interface CrmPanelProps {
  provider: string;
  displayName: string;
  docsUrl: string | null;
  connection: CrmPanelConnection | null;
  health: ProviderHealthResult;
  /** Most recent sync jobs for this provider (newest first). */
  recentJobs: SyncJob[];
  /** Optional usage summary, e.g. { imported: 12, exported: 4 }. */
  usage?: { imported: number; exported: number } | null;
  capabilities: string[];
  setupSteps: string[];
  /** Called when the operator clicks Disconnect; the coordinator supplies the handler. */
  onDisconnect?: () => void;
  disconnecting?: boolean;
}

const STATUS_BADGE: Record<
  ProviderConnectionStatus,
  { label: string; variant: "success" | "warning" | "error" | "default" }
> = {
  connected: { label: "Connected", variant: "success" },
  disconnected: { label: "Disconnected", variant: "default" },
  configuration_required: { label: "Configuration required", variant: "warning" },
  credentials_missing: { label: "Credentials missing", variant: "warning" },
  error: { label: "Error", variant: "error" },
  coming_soon: { label: "Coming soon", variant: "default" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function CrmPanelBase({
  displayName,
  docsUrl,
  connection,
  health,
  recentJobs,
  usage,
  capabilities,
  setupSteps,
  onDisconnect,
  disconnecting,
}: CrmPanelProps) {
  const badge = STATUS_BADGE[health.status];
  const lastJob = recentJobs[0] ?? null;
  const errors = recentJobs.flatMap((j) => j.errors).slice(0, 5);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{displayName}</CardTitle>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-black-400">Health</dt>
              <dd>{health.detail}</dd>
            </div>
            <div>
              <dt className="text-black-400">Last checked</dt>
              <dd>{formatDate(health.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt className="text-black-400">Last sync</dt>
              <dd>{formatDate(connection?.lastSyncAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-black-400">Credential stored</dt>
              <dd>{connection?.hasCredentials ? "Yes (encrypted)" : "No"}</dd>
            </div>
            {connection?.credentialExpiresAt ? (
              <div>
                <dt className="text-black-400">Credential expires</dt>
                <dd>{formatDate(connection.credentialExpiresAt)}</dd>
              </div>
            ) : null}
          </dl>
          {docsUrl ? (
            <p className="mt-3 text-sm">
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 underline"
              >
                Official API docs
              </a>
            </p>
          ) : null}
          {connection && connection.status !== "disconnected" && onDisconnect ? (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={onDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capabilities</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {capabilities.map((cap) => (
              <li key={cap}>{cap}</li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {usage ? (
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-black-400">Imported</dt>
                <dd>{usage.imported} leads</dd>
              </div>
              <div>
                <dt className="text-black-400">Exported</dt>
                <dd>{usage.exported} leads</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent sync activity</CardTitle>
        </CardHeader>
        <CardBody>
          {lastJob ? (
            <ul className="space-y-2 text-sm">
              {recentJobs.slice(0, 5).map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      job.status === "completed"
                        ? "success"
                        : job.status === "failed"
                          ? "error"
                          : "default"
                    }
                  >
                    {job.status}
                  </Badge>
                  <span>
                    {job.direction} · {job.processed} processed · {job.created} created ·{" "}
                    {job.updated} updated · {job.skipped} skipped · {job.failed} failed
                  </span>
                  <span className="text-black-400">{formatDate(job.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black-400">No sync has run yet.</p>
          )}
        </CardBody>
      </Card>

      {errors.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent errors</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {errors.map((err, i) => (
                <li key={`${i}:${err}`}>{err}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * Email-verification panel base — shared presentational shell for
 * the five Stage 5 email-verification provider panels in this
 * directory. NOT wired into any page; the coordinator wires these
 * in.
 *
 * Follows the CrmPanelBase / N8nLivePanels pattern (connection
 * status, health, last sync, usage/credits, activity, error log,
 * disconnect), plus the provider's classification values shown
 * VERBATIM — verification results are never normalised away, so
 * the panel lists exactly what the provider returns.
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

export interface VerificationPanelConnection {
  status: ProviderConnectionStatus;
  hasCredentials: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  credentialExpiresAt: string | null;
}

export interface VerificationPanelProps {
  provider: string;
  displayName: string;
  docsUrl: string | null;
  connection: VerificationPanelConnection | null;
  health: ProviderHealthResult;
  /** Most recent sync jobs for this provider (newest first). */
  recentJobs: SyncJob[];
  /** Optional usage summary from the migration-030 integration_usage table. */
  usage?: { verified: number; creditsUsed: number } | null;
  /** Last known credit balance from the provider, when it reports one. */
  creditBalance?: number | null;
  /** Classification values exactly as the provider returns them. */
  classifications: string[];
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

export function VerificationPanelBase({
  displayName,
  docsUrl,
  connection,
  health,
  recentJobs,
  usage,
  creditBalance,
  classifications,
  capabilities,
  setupSteps,
  onDisconnect,
  disconnecting,
}: VerificationPanelProps) {
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
            {typeof creditBalance === "number" ? (
              <div>
                <dt className="text-black-400">Credit balance</dt>
                <dd>{creditBalance}</dd>
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

      <Card>
        <CardHeader>
          <CardTitle>Classifications (verbatim from the provider)</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-2 text-sm text-black-400">
            Verification results are stored exactly as returned — they are never normalised
            into a generic verdict.
          </p>
          <div className="flex flex-wrap gap-2">
            {classifications.map((c) => (
              <Badge key={c} variant="default">
                {c}
              </Badge>
            ))}
          </div>
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
                <dt className="text-black-400">Verified</dt>
                <dd>{usage.verified} emails</dd>
              </div>
              <div>
                <dt className="text-black-400">Credits used</dt>
                <dd>{usage.creditsUsed}</dd>
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

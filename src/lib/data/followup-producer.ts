/**
 * follow_up_due producer decorator for the campaigns repository.
 *
 * When a campaign becomes active (created as active by the wizard's
 * "Create & Launch", or moved to active via setCampaignStatus), the
 * sequence executor needs a scan job for the workspace. This wrapper
 * fire-and-forgets POST /api/jobs/enqueue — the route resolves the
 * workspace from the caller's session and enqueues today's scan with
 * the service role (see src/lib/jobs/producer.ts for the design).
 *
 * Fire-and-forget by design: enqueueing must never break a lifecycle
 * action, and the daily Vercel Cron drain covers workspaces whose
 * producer call was missed. In Demo Mode there is no server queue —
 * the call is skipped entirely (due steps run via the in-app demo
 * runner on the campaign page).
 */

import type { CampaignsRepository, CreateCampaignInput } from "./campaigns";
import { getDataMode } from "./mode";

export function requestFollowUpScan(): void {
  if (typeof window === "undefined") return;
  if (getDataMode() === "demo") return;
  void fetch("/api/jobs/enqueue", { method: "POST" }).catch(() => {
    // Best-effort producer: the cron drain is the backstop.
  });
}

export function withFollowUpProducer(repo: CampaignsRepository): CampaignsRepository {
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop as string);
      if (prop === "createCampaign") {
        return async (workspaceId: string, input: CreateCampaignInput) => {
          const campaign = await target.createCampaign(workspaceId, input);
          if (campaign.status === "active") requestFollowUpScan();
          return campaign;
        };
      }
      if (prop === "setCampaignStatus") {
        return async (
          workspaceId: string,
          id: string,
          status: Parameters<CampaignsRepository["setCampaignStatus"]>[2]
        ) => {
          await target.setCampaignStatus(workspaceId, id, status);
          if (status === "active") requestFollowUpScan();
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

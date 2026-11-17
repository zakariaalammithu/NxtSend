/**
 * Webhook emission decorators for the data layer (Stage 2c).
 *
 * Wraps the repository factories so real user actions emit outbound
 * webhook events through the secret-free browser notifier:
 *   leads.createLead / leads.importLeads     -> lead.created
 *   leads.updateLead                         -> lead.updated
 *   campaigns.createCampaign                 -> campaign.created
 *   campaigns.setCampaignStatus              -> campaign.status_changed
 *   campaigns.enrollLeads                    -> lead.added_to_campaign
 *   campaigns.removeEnrollment               -> lead.removed_from_campaign
 *
 * Two notifiers fire for every event:
 *  - notifyWebhookEvent (the generic one-endpoint webhooks system)
 *  - notifyZapierEvent (Zapier REST Hooks, POST /api/integrations/zapier/emit)
 *
 * The Zapier emit route fans out to EVERY platform's active
 * subscriptions via emitPlatformEvent (src/lib/integrations/rest),
 * so notifyZapierEvent is also the n8n path: there is NO separate
 * /api/integrations/n8n/emit route and no separate n8n browser
 * notifier — one notifier serves both platforms. The three events
 * that used to be Zapier-only (lead.updated,
 * lead.added_to_campaign, lead.removed_from_campaign) now also
 * fire notifyWebhookEvent, closing the generic-system gap for
 * them, and they reach n8n subscriptions through the same fan-out.
 * Both notifiers are fire-and-forget and no-ops outside the
 * browser, so emission can never break a data operation (or a unit
 * test). Server-side mutations (Zapier/n8n REST routes, the Stripe
 * webhook, the inbox reply route) emit through the server-side
 * helper instead (src/lib/integrations/rest/emit.ts) — the
 * browser notifier alone would leave server-side repo calls
 * emitting nothing.
 */

import { notifyWebhookEvent } from "@/lib/webhooks/client";
import { notifyZapierEvent } from "@/lib/integrations/zapier/client";
import type { CampaignsRepository } from "./campaigns";
import type { LeadsRepository, CreateLeadInput } from "./leads";
import type { NewLeadInput } from "./csv";
import type { Lead } from "@/types";

export function withLeadWebhookEvents(repo: LeadsRepository): LeadsRepository {
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop as string);
      if (prop === "createLead") {
        return async (workspaceId: string, input: CreateLeadInput) => {
          const lead = await target.createLead(workspaceId, input);
          notifyWebhookEvent("lead.created", {
            source: "manual",
            leadId: lead.id,
            email: lead.email ?? undefined,
            firstName: lead.first_name ?? undefined,
            company: lead.company ?? undefined,
          });
          notifyZapierEvent("lead.created", {
            source: "manual",
            leadId: lead.id,
            email: lead.email ?? undefined,
            firstName: lead.first_name ?? undefined,
            company: lead.company ?? undefined,
          });
          return lead;
        };
      }
      if (prop === "importLeads") {
        return async (workspaceId: string, inputs: NewLeadInput[]) => {
          const leads = await target.importLeads(workspaceId, inputs);
          if (leads.length > 0) {
            notifyWebhookEvent("lead.created", {
              source: "csv_import",
              count: leads.length,
              leadIds: leads.map((l) => l.id),
            });
            notifyZapierEvent("lead.created", {
              source: "csv_import",
              count: leads.length,
              leadIds: leads.map((l) => l.id),
            });
          }
          return leads;
        };
      }
      if (prop === "updateLead") {
        // lead.updated fires on ANY successful update, with the
        // list of fields the caller actually changed. It fires
        // BOTH notifiers (the generic gap is closed here) and
        // reaches n8n through the emit route's fan-out.
        return async (id: string, patch: Partial<Lead>) => {
          const updated = await target.updateLead(id, patch);
          const changedFields = Object.keys(patch);
          notifyWebhookEvent("lead.updated", {
            source: "manual",
            leadId: updated.id,
            changed_fields: changedFields,
          });
          notifyZapierEvent("lead.updated", {
            source: "manual",
            leadId: updated.id,
            changed_fields: changedFields,
          });
          return updated;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function withCampaignWebhookEvents(
  repo: CampaignsRepository
): CampaignsRepository {
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop as string);
      if (prop === "createCampaign") {
        return async (
          workspaceId: string,
          input: Parameters<CampaignsRepository["createCampaign"]>[1]
        ) => {
          const campaign = await target.createCampaign(workspaceId, input);
          notifyWebhookEvent("campaign.created", {
            campaignId: campaign.id,
            name: campaign.name,
            status: campaign.status,
          });
          notifyZapierEvent("campaign.created", {
            campaignId: campaign.id,
            name: campaign.name,
            status: campaign.status,
          });
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
          notifyWebhookEvent("campaign.status_changed", {
            campaignId: id,
            status,
          });
          notifyZapierEvent("campaign.status_changed", {
            campaignId: id,
            status,
          });
        };
      }
      if (prop === "enrollLeads") {
        return async (
          workspaceId: string,
          campaignId: string,
          leadIds: string[]
        ) => {
          const result = await target.enrollLeads(workspaceId, campaignId, leadIds);
          if (result.enrolled > 0) {
            notifyWebhookEvent("lead.added_to_campaign", {
              campaignId,
              leadIds,
              enrolled: result.enrolled,
            });
            notifyZapierEvent("lead.added_to_campaign", {
              campaignId,
              leadIds,
              enrolled: result.enrolled,
            });
          }
          return result;
        };
      }
      if (prop === "removeEnrollment") {
        return async (campaignId: string, leadId: string) => {
          await target.removeEnrollment(campaignId, leadId);
          notifyWebhookEvent("lead.removed_from_campaign", {
            campaignId,
            leadId,
          });
          notifyZapierEvent("lead.removed_from_campaign", {
            campaignId,
            leadId,
          });
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

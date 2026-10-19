/**
 * Webhook emission decorators for the data layer (Stage 2c).
 *
 * Wraps the repository factories so real user actions emit outbound
 * webhook events through the secret-free browser notifier:
 *   leads.createLead / leads.importLeads     -> lead.created
 *   campaigns.createCampaign                 -> campaign.created
 *   campaigns.setCampaignStatus              -> campaign.status_changed
 *
 * The notifier is fire-and-forget and a no-op outside the browser, so
 * emission can never break a data operation (or a unit test).
 */

import { notifyWebhookEvent } from "@/lib/webhooks/client";
import type { CampaignsRepository } from "./campaigns";
import type { LeadsRepository, CreateLeadInput } from "./leads";
import type { NewLeadInput } from "./csv";

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
          }
          return leads;
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
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

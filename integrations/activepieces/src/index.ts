/**
 * NxtSend piece.
 *
 * Build-verified 2026-11-19: tsc clean + runtime construct against
 * @activepieces/pieces-framework 0.32.0 (17 actions, 9 triggers,
 * OAuth2 auth). NOT installed in any Activepieces instance, NOT
 * submitted to Activepieces. Build with
 * `npm install && npm run build` (see README.md).
 *
 * No secrets in this file. Auth is OAuth 2.0 (src/auth.ts) against
 * NxtSend's shared authorization server; the client comes from the
 * one-time Dynamic Client Registration call.
 */
import { createPiece } from "@activepieces/pieces-framework";
import { PieceCategory } from "@activepieces/shared";
import { nxtsendAuth } from "./auth";
import { createLead } from "./lib/actions/create-lead";
import { updateLead } from "./lib/actions/update-lead";
import { deleteLead } from "./lib/actions/delete-lead";
import { importLeads } from "./lib/actions/import-leads";
import { createCampaign } from "./lib/actions/create-campaign";
import { updateCampaign } from "./lib/actions/update-campaign";
import { campaignAction } from "./lib/actions/campaign-action";
import { addLeadsToCampaign } from "./lib/actions/add-leads-to-campaign";
import { removeLeadFromCampaign } from "./lib/actions/remove-lead-from-campaign";
import { sendInboxReply } from "./lib/actions/send-inbox-reply";
import { scheduleFollowUp } from "./lib/actions/schedule-follow-up";
import { getCampaignPerformance } from "./lib/actions/get-campaign-performance";
import { getUsage } from "./lib/actions/get-usage";
import { searchLeads } from "./lib/actions/search-leads";
import { searchCampaigns } from "./lib/actions/search-campaigns";
import { subscribeWebhook } from "./lib/actions/subscribe-webhook";
import { customApiCall } from "./lib/actions/custom-api-call";
import { newLead } from "./lib/triggers/new-lead";
import { leadUpdated } from "./lib/triggers/lead-updated";
import { leadAddedToCampaign } from "./lib/triggers/lead-added-to-campaign";
import { leadRemovedFromCampaign } from "./lib/triggers/lead-removed-from-campaign";
import { campaignCreated } from "./lib/triggers/campaign-created";
import { campaignStatusChanged } from "./lib/triggers/campaign-status-changed";
import { newInboxReply } from "./lib/triggers/new-inbox-reply";
import { subscriptionChanged } from "./lib/triggers/subscription-changed";
import { newLeadPolling } from "./lib/triggers/new-lead-polling";

export const nxtsend = createPiece({
  displayName: "NxtSend",
  description: "Lead and campaign automation for NxtSend workspaces — leads, campaigns, sequences, inbox conversations and usage.",
  auth: nxtsendAuth,
  minimumSupportedRelease: "0.32.0",
  logoUrl: "https://nxtsend.com/logo.png",
  categories: [PieceCategory.SALES_AND_CRM],
  authors: ["NxtSend"],
  actions: [
    createLead,
    updateLead,
    deleteLead,
    importLeads,
    createCampaign,
    updateCampaign,
    campaignAction,
    addLeadsToCampaign,
    removeLeadFromCampaign,
    sendInboxReply,
    scheduleFollowUp,
    getCampaignPerformance,
    getUsage,
    searchLeads,
    searchCampaigns,
    subscribeWebhook,
    customApiCall,
  ],
  triggers: [
    newLead,
    leadUpdated,
    leadAddedToCampaign,
    leadRemovedFromCampaign,
    campaignCreated,
    campaignStatusChanged,
    newInboxReply,
    subscriptionChanged,
    newLeadPolling,
  ],
});

'use strict';

/**
 * NxtSend Zapier app — entry point.
 *
 * Plain JavaScript (no TypeScript build step): the Zapier CLI
 * validates and runs this file directly, and a build step would
 * only add a failure mode. JSDoc comments carry the types.
 *
 * Middleware order (verified in the installed
 * zapier-platform-core 18.6.0, src/tools/create-app-request-client.js):
 *
 *   before: prepareRequest → app.beforeRequest → sanitizeHeaders …
 *   after:  prepareResponse → throwForStaleAuth (401 → refresh, when
 *           autoRefresh is on) → throwForThrottling (429)
 *           → app.afterResponse → throwForStatus
 *
 * Two consequences drive the code below:
 * 1. OAuth2 gets NO automatic Authorization header from the core
 *    (only basic/digest/oauth1 do), so beforeRequest injects
 *    `Authorization: Bearer <access_token>` itself.
 * 2. A live 401 never reaches afterResponse — the core turns it
 *    into a token refresh + retry first. afterResponse therefore
 *    leaves 401s alone and only maps other error statuses
 *    (422 LinkedIn refusal, 503 demo mode, other 4xx/5xx) into
 *    plain-words errors using the server's `{error}` body.
 */

const { version: platformVersion } = require('zapier-platform-core');
const authentication = require('./authentication');

// Polling triggers (list endpoints — see README "Polling vs Instant").
const newLead = require('./triggers/newLead');
const updatedLead = require('./triggers/updatedLead');
const newCampaign = require('./triggers/newCampaign');
const campaignStatusChanged = require('./triggers/campaignStatusChanged');
const newConversation = require('./triggers/newConversation');
// Hidden triggers that power dynamic dropdowns (not shown in the editor).
const listCampaigns = require('./triggers/listCampaigns');
const listAccounts = require('./triggers/listAccounts');
const listLeadStatuses = require('./triggers/listLeadStatuses');
const listSequences = require('./triggers/listSequences');

// REST Hook (instant) triggers — real webhook delivery only.
const newLeadInstant = require('./triggers/instant/leadCreated');
const updatedLeadInstant = require('./triggers/instant/leadUpdated');
const leadAddedToCampaignInstant = require('./triggers/instant/leadAddedToCampaign');
const leadRemovedFromCampaignInstant = require('./triggers/instant/leadRemovedFromCampaign');
const newCampaignInstant = require('./triggers/instant/campaignCreated');
const campaignStatusChangedInstant = require('./triggers/instant/campaignStatusChanged');
const newReplyInstant = require('./triggers/instant/replyCreated');
const subscriptionChangedInstant = require('./triggers/instant/subscriptionChanged');

// Searches.
const findLead = require('./searches/findLead');
const findCampaign = require('./searches/findCampaign');
const findConversation = require('./searches/findConversation');
const findAccount = require('./searches/findAccount');
const getCampaignPerformance = require('./searches/getCampaignPerformance');

// Actions.
const createLead = require('./creates/createLead');
const updateLead = require('./creates/updateLead');
const importLeads = require('./creates/importLeads');
const createCampaign = require('./creates/createCampaign');
const updateCampaign = require('./creates/updateCampaign');
const pauseCampaign = require('./creates/pauseCampaign');
const resumeCampaign = require('./creates/resumeCampaign');
const stopCampaign = require('./creates/stopCampaign');
const archiveCampaign = require('./creates/archiveCampaign');
const addLeadsToCampaign = require('./creates/addLeadsToCampaign');
const removeLeadFromCampaign = require('./creates/removeLeadFromCampaign');
const sendReply = require('./creates/sendReply');

/**
 * Inject the Bearer token. Zapier does not add it automatically
 * for OAuth2 apps, and every v1 endpoint requires it.
 */
const beforeRequest = (request, z, bundle) => {
  request.headers = request.headers || {};
  const token = bundle && bundle.authData && bundle.authData.access_token;
  if (token && !request.headers.Authorization && !request.headers.authorization) {
    request.headers.Authorization = `Bearer ${token}`;
  }
  return request;
};

/** Pull the server's `{error}` message out of a response, if any. */
const serverErrorMessage = (response) => {
  try {
    if (response.json && typeof response.json === 'object' && response.json.error) {
      return String(response.json.error);
    }
  } catch (error) {
    // fall through to the raw content
  }
  if (typeof response.content === 'string' && response.content.trim()) {
    return response.content.slice(0, 500);
  }
  return '';
};

/**
 * Map error responses to plain-words errors. Runs AFTER the core's
 * own 401→refresh handling, so 401s are deliberately passed
 * through untouched here (a 401 that survives refresh surfaces as
 * the core's auth error and prompts a reconnect).
 */
const afterResponse = (response, z, bundle) => {
  const status = response.status;
  if (!status || status < 400) {
    return response;
  }
  if (status === 401) {
    return response;
  }
  const detail = serverErrorMessage(response);
  const suffix = detail ? `: ${detail}` : '';
  if (status === 503) {
    throw new Error(
      `NxtSend is in demo mode or the Zapier integration is disabled (HTTP 503)${suffix}. ` +
        'Enable the Zapier integration on the NxtSend server and reconnect, then try again.'
    );
  }
  if (status === 422) {
    throw new Error(
      `NxtSend refused this request (HTTP 422)${suffix}. ` +
        'LinkedIn sends are not available in NxtSend — there is no authorized provider.'
    );
  }
  if (status === 404) {
    throw new Error(
      `NxtSend could not find that record (HTTP 404)${suffix}. Check the ID and try again.`
    );
  }
  throw new Error(`NxtSend request failed (HTTP ${status})${suffix}.`);
};

const App = {
  version: '1.0.0',
  platformVersion,
  // Do not let Zapier strip empty strings/nulls from inputData:
  // every perform guards empty values itself, so raw input is
  // more predictable (silences style warning D028).
  flags: { cleanInputData: false },
  authentication,
  beforeRequest,
  afterResponse,
  triggers: {
    [newLead.key]: newLead,
    [updatedLead.key]: updatedLead,
    [newCampaign.key]: newCampaign,
    [campaignStatusChanged.key]: campaignStatusChanged,
    [newConversation.key]: newConversation,
    [listCampaigns.key]: listCampaigns,
    [listAccounts.key]: listAccounts,
    [listLeadStatuses.key]: listLeadStatuses,
    [listSequences.key]: listSequences,
    [newLeadInstant.key]: newLeadInstant,
    [updatedLeadInstant.key]: updatedLeadInstant,
    [leadAddedToCampaignInstant.key]: leadAddedToCampaignInstant,
    [leadRemovedFromCampaignInstant.key]: leadRemovedFromCampaignInstant,
    [newCampaignInstant.key]: newCampaignInstant,
    [campaignStatusChangedInstant.key]: campaignStatusChangedInstant,
    [newReplyInstant.key]: newReplyInstant,
    [subscriptionChangedInstant.key]: subscriptionChangedInstant,
  },
  searches: {
    [findLead.key]: findLead,
    [findCampaign.key]: findCampaign,
    [findConversation.key]: findConversation,
    [findAccount.key]: findAccount,
    [getCampaignPerformance.key]: getCampaignPerformance,
  },
  // "Find or Create" pairings: Find Lead → Create Lead,
  // Find Campaign → Create Campaign.
  searchOrCreates: {
    find_lead: {
      key: 'find_lead',
      display: {
        label: 'Find or Create Lead',
        description: 'Finds a lead by name, email, or ID, or creates it when not found.',
      },
      search: 'find_lead',
      create: 'create_lead',
    },
    find_campaign: {
      key: 'find_campaign',
      display: {
        label: 'Find or Create Campaign',
        description: 'Finds a campaign by name, ID, or status, or creates it when not found.',
      },
      search: 'find_campaign',
      create: 'create_campaign',
    },
  },
  creates: {
    [createLead.key]: createLead,
    [updateLead.key]: updateLead,
    [importLeads.key]: importLeads,
    [createCampaign.key]: createCampaign,
    [updateCampaign.key]: updateCampaign,
    [pauseCampaign.key]: pauseCampaign,
    [resumeCampaign.key]: resumeCampaign,
    [stopCampaign.key]: stopCampaign,
    [archiveCampaign.key]: archiveCampaign,
    [addLeadsToCampaign.key]: addLeadsToCampaign,
    [removeLeadFromCampaign.key]: removeLeadFromCampaign,
    [sendReply.key]: sendReply,
  },
};

module.exports = App;

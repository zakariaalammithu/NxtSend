// Shared constants for the NxtSend n8n community node package.
//
// The NxtSend n8n REST API contract (all endpoints live under this base
// path; demo workspaces answer 503; 120 requests/minute):
//   Base URL: {baseUrl} (credential field, default https://nxtsend.com)
//   Auth:     Authorization: Bearer <apiKey | OAuth2 access token>
// "Contact" is NOT a separate entity in NxtSend: contact operations map
// 1:1 to Lead operations, so there is no Contact resource in this package.

export const NXT_API_BASE_PATH = '/api/integrations/n8n/v1';

export const DEFAULT_BASE_URL = 'https://nxtsend.com';

/** Webhook event types offered by the NxtSend trigger. There is NO
 *  LinkedIn-connection-accepted event — do not add one. */
export const NXT_EVENTS = [
	{ name: 'Lead Created', value: 'lead.created' },
	{ name: 'Lead Updated', value: 'lead.updated' },
	{ name: 'Lead Added to Campaign', value: 'lead.added_to_campaign' },
	{ name: 'Lead Removed From Campaign', value: 'lead.removed_from_campaign' },
	{ name: 'Campaign Created', value: 'campaign.created' },
	{ name: 'Campaign Status Changed', value: 'campaign.status_changed' },
	{ name: 'Conversation Reply Created', value: 'conversation.reply_created' },
	// Polling-only: NxtSend emits no webhook event for a new
	// conversation, so this event exists only in polling mode (it polls
	// /conversations by created_at). Webhook activation refuses it —
	// see webhookMethods.create in NxtSendTrigger.node.ts.
	{ name: 'Conversation Created', value: 'conversation.created' },
	{ name: 'Subscription Changed', value: 'subscription.changed' },
] as const;

export type NxtEvent = (typeof NXT_EVENTS)[number]['value'];

export interface OperationEndpoint {
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	/** Path template; `:param` segments are substituted from the caller's params. */
	path: string;
}

/**
 * Operation -> endpoint map. Single source of truth: the main node builds
 * its requests from this map, and the tests assert every operation in the
 * node description has exactly one entry here (and vice versa).
 *
 * Notes on the less obvious mappings:
 * - Lead "Update Status" is a Lead field update: PATCH /leads/:id {status}.
 * - Campaign "Create" is draft-only; launching happens in the NxtSend
 *   dashboard. There is NO campaign launch endpoint.
 * - LinkedIn Account "Get" / "Get Status" use /accounts/:id and
 *   /accounts/:id/status (both routes exist on the server).
 * - Conversation "Get Replies" reuses GET /conversations/:id and returns
 *   the conversation's replies.
 * - Analytics "Get Lead Statistics" combines GET /usage with a live
 *   GET /leads call; counts always come from real API data, never invented.
 * - Analytics "Compare Campaigns" is two GET /campaigns/:id/performance
 *   calls. The performance payload's `accepted` field is always null in
 *   the API — it is surfaced as null, never invented.
 * - There is NO draft endpoint and NO date-range report endpoint.
 */
export const OPERATION_ENDPOINTS: Record<string, Record<string, OperationEndpoint>> = {
	lead: {
		// POST /leads
		create: { method: 'POST', path: '/leads' },
		// GET /leads/:id
		get: { method: 'GET', path: '/leads/:id' },
		// GET /leads?limit&after
		getAll: { method: 'GET', path: '/leads' },
		// PATCH /leads/:id
		update: { method: 'PATCH', path: '/leads/:id' },
		// DELETE /leads/:id
		delete: { method: 'DELETE', path: '/leads/:id' },
		// GET /search/leads?q&status
		search: { method: 'GET', path: '/search/leads' },
		// POST /leads/import
		import: { method: 'POST', path: '/leads/import' },
		// POST /campaigns/:campaignId/leads
		addToCampaign: { method: 'POST', path: '/campaigns/:campaignId/leads' },
		// DELETE /campaigns/:campaignId/leads/:id
		removeFromCampaign: { method: 'DELETE', path: '/campaigns/:campaignId/leads/:id' },
		// PATCH /leads/:id {status}
		updateStatus: { method: 'PATCH', path: '/leads/:id' },
	},
	campaign: {
		// POST /campaigns (draft-only)
		create: { method: 'POST', path: '/campaigns' },
		// GET /campaigns/:id
		get: { method: 'GET', path: '/campaigns/:id' },
		// GET /campaigns
		getAll: { method: 'GET', path: '/campaigns' },
		// PATCH /campaigns/:id
		update: { method: 'PATCH', path: '/campaigns/:id' },
		// POST /campaigns/:id/pause
		pause: { method: 'POST', path: '/campaigns/:id/pause' },
		// POST /campaigns/:id/resume
		resume: { method: 'POST', path: '/campaigns/:id/resume' },
		// POST /campaigns/:id/stop
		stop: { method: 'POST', path: '/campaigns/:id/stop' },
		// POST /campaigns/:id/archive
		archive: { method: 'POST', path: '/campaigns/:id/archive' },
		// POST /campaigns/:id/leads
		addLeads: { method: 'POST', path: '/campaigns/:id/leads' },
		// GET /campaigns/:id/performance
		getPerformance: { method: 'GET', path: '/campaigns/:id/performance' },
	},
	sequence: {
		// GET /campaigns/:id/sequence
		getSequence: { method: 'GET', path: '/campaigns/:id/sequence' },
		// POST /campaigns/:id/steps (full replace)
		replaceSteps: { method: 'POST', path: '/campaigns/:id/steps' },
		// GET /campaigns/:id/follow-ups
		getFollowUps: { method: 'GET', path: '/campaigns/:id/follow-ups' },
		// POST /campaigns/:id/follow-ups
		scheduleFollowUp: { method: 'POST', path: '/campaigns/:id/follow-ups' },
		// DELETE /campaigns/:id/follow-ups/:followUpId
		cancelFollowUp: { method: 'DELETE', path: '/campaigns/:id/follow-ups/:followUpId' },
		// GET /campaigns/:id/execution-status
		getExecutionStatus: { method: 'GET', path: '/campaigns/:id/execution-status' },
	},
	linkedinAccount: {
		// GET /accounts/:id
		get: { method: 'GET', path: '/accounts/:id' },
		// GET /accounts
		getAll: { method: 'GET', path: '/accounts' },
		// GET /accounts/:id/status
		getStatus: { method: 'GET', path: '/accounts/:id/status' },
	},
	conversation: {
		// GET /conversations/:id
		get: { method: 'GET', path: '/conversations/:id' },
		// GET /conversations?search&channel&unreadOnly&limit&offset
		getAll: { method: 'GET', path: '/conversations' },
		// GET /search/conversations?q
		search: { method: 'GET', path: '/search/conversations' },
		// GET /conversations/:id (replies live on the conversation)
		getReplies: { method: 'GET', path: '/conversations/:id' },
		// POST /conversations/:id/replies (email-only; LinkedIn returns 422)
		sendReply: { method: 'POST', path: '/conversations/:id/replies' },
	},
	analytics: {
		// GET /campaigns/:id/performance
		getCampaignStatistics: { method: 'GET', path: '/campaigns/:id/performance' },
		// GET /usage (+ GET /leads, combined — see the node)
		getLeadStatistics: { method: 'GET', path: '/usage' },
		// GET /usage
		getAccountActivity: { method: 'GET', path: '/usage' },
		// GET /campaigns/:id/performance x2
		compareCampaigns: { method: 'GET', path: '/campaigns/:id/performance' },
		// GET /usage
		getUsageReport: { method: 'GET', path: '/usage' },
	},
};

/** List endpoint used by the trigger's polling mode for each event. */
export const POLL_ENDPOINTS: Record<string, { path: string; timestampField: string }> = {
	'lead.created': { path: '/leads', timestampField: 'created_at' },
	'lead.updated': { path: '/leads', timestampField: 'updated_at' },
	'lead.added_to_campaign': { path: '/leads', timestampField: 'updated_at' },
	'lead.removed_from_campaign': { path: '/leads', timestampField: 'updated_at' },
	'campaign.created': { path: '/campaigns', timestampField: 'created_at' },
	'campaign.status_changed': { path: '/campaigns', timestampField: 'updated_at' },
	'conversation.reply_created': { path: '/conversations', timestampField: 'updated_at' },
	// Polling-only event (no webhook source): a new conversation is a
	// conversation whose created_at is new.
	'conversation.created': { path: '/conversations', timestampField: 'created_at' },
	// subscription.changed has no list endpoint with timestamps; polling
	// compares the live subscription list against ids seen on previous polls.
	'subscription.changed': { path: '/webhooks/subscriptions', timestampField: '' },
};

// NxtSend action node (programmatic style).
//
// Why programmatic, not declarative: several operations need more than one
// API call per execution (Analytics "Compare Campaigns" = two performance
// calls; "Get Lead Statistics" = usage + leads list), and responses need
// shaping (one item per list element / per reply) that declarative routing
// cannot express. The trigger node shares the same helpers.
//
// Every operation maps to exactly one endpoint in OPERATION_ENDPOINTS
// (nodes/shared/constants.ts); the mapping is asserted by the tests.
import { randomUUID } from 'node:crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	JsonObject,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { OPERATION_ENDPOINTS } from '../shared/constants';
import {
	API_KEY_TYPE,
	OAUTH2_TYPE,
	normalizeDropdownOptions,
	nxtsendApiRequest,
} from '../shared/api';
import { nxtSendProperties } from './properties';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
	return EMAIL_RE.test(value);
}

/** Split a comma-separated string into a trimmed, non-empty array. */
function splitList(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
}

/** A `json`-type parameter may arrive as an object or a raw string. */
function parseJsonParam(value: unknown, field: string, node: INode, itemIndex: number): unknown {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') return undefined;
		try {
			return JSON.parse(trimmed);
		} catch {
			throw new NodeOperationError(node, `Field "${field}" is not valid JSON.`, { itemIndex });
		}
	}
	return value;
}

/** One output item per array element; a single object stays one item. */
function toItems(data: unknown, itemIndex: number): INodeExecutionData[] {
	if (Array.isArray(data)) {
		return data.map((entry) => ({
			json: (entry ?? {}) as IDataObject,
			pairedItem: { item: itemIndex },
		}));
	}
	const json =
		data === '' || data === undefined || data === null
			? { success: true }
			: (data as IDataObject);
	return [{ json, pairedItem: { item: itemIndex } }];
}

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool -- this is a workflow node, not an AI tool: it drives LinkedIn outreach automation with stored credentials, so it deliberately omits `usableAsTool` (n8n-workflow 2.48.2 only accepts `true` there; omission is the opt-out).
export class NxtSend implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NxtSend',
		name: 'nxtSend',
		icon: { light: 'file:nxtsend.svg', dark: 'file:nxtsend.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Work with NxtSend leads, campaigns, sequences, conversations and analytics. Contacts are leads in NxtSend — use the Lead resource.',
		defaults: {
			name: 'NxtSend',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{ name: API_KEY_TYPE, required: true },
			{ name: OAUTH2_TYPE, required: true },
		],
		// NOTE: deliberately no `usableAsTool` — this is a workflow node, not
		// an AI tool. (n8n-workflow 2.48.2 types `usableAsTool` as
		// `true | UsableAsToolDescription`; omitting it is how a node opts
		// out — `false` is a type error there.)
		properties: nxtSendProperties,
	};

	methods = {
		loadOptions: {
			async getCampaigns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = await nxtsendApiRequest.call(this, {
						method: 'GET',
						path: '/dropdowns/campaigns',
					});
					return normalizeDropdownOptions(response);
				} catch {
					return [];
				}
			},
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = await nxtsendApiRequest.call(this, {
						method: 'GET',
						path: '/dropdowns/accounts',
					});
					return normalizeDropdownOptions(response);
				} catch {
					return [];
				}
			},
			async getLeadStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = await nxtsendApiRequest.call(this, {
						method: 'GET',
						path: '/dropdowns/lead-statuses',
					});
					return normalizeDropdownOptions(response);
				} catch {
					return [];
				}
			},
			async getSequences(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const campaignId = this.getCurrentNodeParameter('campaignId') as string;
					if (!campaignId) return [];
					const response = await nxtsendApiRequest.call(this, {
						method: 'GET',
						path: '/dropdowns/sequences',
						qs: { campaign_id: campaignId },
					});
					return normalizeDropdownOptions(response);
				} catch {
					return [];
				}
			},
			// Conversations have no /dropdowns endpoint: list them directly
			// and label each by subject, then contact name, then email.
			async getConversations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = (await nxtsendApiRequest.call(this, {
						method: 'GET',
						path: '/conversations',
						qs: { limit: 100 },
					})) as IDataObject;
					const list = Array.isArray(response?.conversations)
						? (response.conversations as IDataObject[])
						: [];
					return list
						.filter((c) => typeof c.id === 'string' && c.id !== '')
						.map((c) => ({
							name: String(c.subject ?? c.contact_name ?? c.contact_email ?? c.id),
							value: String(c.id),
						}));
				} catch {
					return [];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const endpoint = OPERATION_ENDPOINTS[resource]?.[operation];
				if (!endpoint) {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${resource} → ${operation}`, {
						itemIndex,
					});
				}

				const output = await executeOperation(this, resource, operation, endpoint, itemIndex);
				returnData.push(...output);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				if (error instanceof NodeApiError) {
					// Re-wrapping a NodeApiError hands back the original (with
					// the API's error body and HTTP code intact).
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}

}
async function executeOperation(
	context: IExecuteFunctions,
		resource: string,
		operation: string,
		endpoint: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string },
		itemIndex: number,
	): Promise<INodeExecutionData[]> {
		const get = (name: string, fallback?: unknown) =>
			context.getNodeParameter(name, itemIndex, fallback) as unknown;
		const getString = (name: string, fallback = '') => String(get(name, fallback) ?? '');
		const request = (options: Parameters<typeof nxtsendApiRequest>[0]) =>
			nxtsendApiRequest.call(context, options);

		// ── Lead ───────────────────────────────────────────────────────
		if (resource === 'lead') {
			switch (operation) {
				case 'create': {
					// POST /leads
					const email = getString('email');
					if (!isValidEmail(email)) {
						throw new NodeOperationError(context.getNode(), `Invalid email address: "${email}".`, {
							itemIndex,
						});
					}
					const tags = getString('tags');
					const body: IDataObject = {
						first_name: getString('firstName'),
						last_name: getString('lastName'),
						email,
					};
					const company = getString('company');
					const jobTitle = getString('jobTitle');
					const linkedinUrl = getString('linkedinUrl');
					if (company) body.company = company;
					if (jobTitle) body.job_title = jobTitle;
					if (linkedinUrl) body.linkedin_url = linkedinUrl;
					if (tags) body.tags = splitList(tags);
					const response = await request({ method: endpoint.method, path: endpoint.path, body });
					return toItems(response, itemIndex);
				}
				case 'get': {
					// GET /leads/:id
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('leadId') },
					});
					return toItems(response, itemIndex);
				}
				case 'getAll': {
					// GET /leads?limit&after
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						qs: { limit: get('limit', 50) as number, after: getString('after') || undefined },
					});
					return toItems(response, itemIndex);
				}
				case 'update': {
					// PATCH /leads/:id
					const fields = (get('updateFields', {}) ?? {}) as IDataObject;
					const body: IDataObject = { ...fields };
					if (typeof body.tags === 'string') body.tags = splitList(body.tags);
					if (body.email && !isValidEmail(String(body.email))) {
						throw new NodeOperationError(context.getNode(), `Invalid email address: "${body.email}".`, {
							itemIndex,
						});
					}
					if (Object.keys(body).length === 0) {
						throw new NodeOperationError(context.getNode(), 'No fields to update — set at least one field.', {
							itemIndex,
						});
					}
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('leadId') },
						body,
					});
					return toItems(response, itemIndex);
				}
				case 'delete': {
					// DELETE /leads/:id
					const leadId = getString('leadId');
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: leadId },
					});
					return toItems(response === '' || response === undefined ? { id: leadId, deleted: true } : response, itemIndex);
				}
				case 'search': {
					// GET /search/leads?q&status
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						qs: { q: getString('query'), status: getString('status') || undefined },
					});
					return toItems(response, itemIndex);
				}
				case 'import': {
					// POST /leads/import (max 100 leads)
					const leads = parseJsonParam(get('leadsJson', '[]'), 'Leads (JSON)', context.getNode(), itemIndex);
					if (!Array.isArray(leads) || leads.length === 0) {
						throw new NodeOperationError(context.getNode(), 'Leads (JSON) must be a non-empty JSON array.', {
							itemIndex,
						});
					}
					if (leads.length > 100) {
						throw new NodeOperationError(
							context.getNode(),
							`Import supports at most 100 leads per call, got ${leads.length}.`,
							{ itemIndex },
						);
					}
					for (const lead of leads as IDataObject[]) {
						if (!lead.first_name || !lead.last_name || !lead.email) {
							throw new NodeOperationError(
								context.getNode(),
								'Every imported lead needs first_name, last_name and email.',
								{ itemIndex },
							);
						}
						if (!isValidEmail(String(lead.email))) {
							throw new NodeOperationError(context.getNode(), `Invalid email address: "${lead.email}".`, {
								itemIndex,
							});
						}
					}
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						body: { leads },
					});
					return toItems(response, itemIndex);
				}
				case 'addToCampaign': {
					// POST /campaigns/:campaignId/leads
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { campaignId: getString('campaignId') },
						body: { leadIds: [getString('leadId')] },
					});
					return toItems(response, itemIndex);
				}
				case 'removeFromCampaign': {
					// DELETE /campaigns/:campaignId/leads/:id
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { campaignId: getString('campaignId'), id: getString('leadId') },
					});
					return toItems(response, itemIndex);
				}
				case 'updateStatus': {
					// PATCH /leads/:id {status}
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('leadId') },
						body: { status: getString('status') },
					});
					return toItems(response, itemIndex);
				}
			}
		}

		// ── Campaign ───────────────────────────────────────────────────
		if (resource === 'campaign') {
			const campaignId = getString('campaignId');
			switch (operation) {
				case 'create': {
					// POST /campaigns — DRAFT ONLY; launching is done in the
					// NxtSend dashboard (there is no launch endpoint).
					const steps = parseJsonParam(get('stepsJson', '[]'), 'Steps (JSON)', context.getNode(), itemIndex);
					const body: IDataObject = {
						name: getString('name'),
						type: getString('type'),
					};
					const description = getString('description');
					if (description) body.description = description;
					if (Array.isArray(steps) && steps.length > 0) body.steps = steps;
					const response = await request({ method: endpoint.method, path: endpoint.path, body });
					return toItems(response, itemIndex);
				}
				case 'get': {
					// GET /campaigns/:id
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
					});
					return toItems(response, itemIndex);
				}
				case 'getAll': {
					// GET /campaigns
					const response = await request({ method: endpoint.method, path: endpoint.path });
					return toItems(response, itemIndex);
				}
				case 'update': {
					// PATCH /campaigns/:id
					const fields = (get('updateFields', {}) ?? {}) as IDataObject;
					if (Object.keys(fields).length === 0) {
						throw new NodeOperationError(context.getNode(), 'No fields to update — set at least one field.', {
							itemIndex,
						});
					}
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
						body: fields,
					});
					return toItems(response, itemIndex);
				}
				case 'pause':
				case 'resume':
				case 'stop':
				case 'archive': {
					// POST /campaigns/:id/pause|resume|stop|archive
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
					});
					return toItems(response, itemIndex);
				}
				case 'addLeads': {
					// POST /campaigns/:id/leads
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
						body: { leadIds: splitList(getString('leadIds')) },
					});
					return toItems(response, itemIndex);
				}
				case 'getPerformance': {
					// GET /campaigns/:id/performance — the payload's
					// `accepted` field is always null; it is passed through
					// as null, never invented.
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
					});
					return toItems(response, itemIndex);
				}
			}
		}

		// ── Sequence ───────────────────────────────────────────────────
		if (resource === 'sequence') {
			const campaignId = getString('campaignId');
			switch (operation) {
				case 'getSequence': {
					// GET /campaigns/:id/sequence
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
					});
					return toItems(response, itemIndex);
				}
				case 'replaceSteps': {
					// POST /campaigns/:id/steps (full replace)
					const steps = parseJsonParam(get('stepsJson', '[]'), 'Steps (JSON)', context.getNode(), itemIndex);
					if (!Array.isArray(steps)) {
						throw new NodeOperationError(context.getNode(), 'Steps (JSON) must be a JSON array of steps.', {
							itemIndex,
						});
					}
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
						body: { steps },
					});
					return toItems(response, itemIndex);
				}
				case 'getFollowUps': {
					// GET /campaigns/:id/follow-ups
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
					});
					return toItems(response, itemIndex);
				}
				case 'scheduleFollowUp': {
					// POST /campaigns/:id/follow-ups — the server's
					// ScheduleReplyInput is { conversation_id, body,
					// scheduled_at } (snake_case); all three are required.
					// Anything else is ignored server-side, so the node
					// sends exactly these three fields.
					const conversationId = getString('conversationId');
					const scheduledAt = getString('scheduledAt');
					const content = getString('content');
					if (!conversationId || !scheduledAt || !content) {
						throw new NodeOperationError(
							context.getNode(),
							'Schedule Follow-Up needs a conversation, a scheduled time, and content.',
							{ itemIndex },
						);
					}
					const body: IDataObject = {
						conversation_id: conversationId,
						body: content,
						scheduled_at: scheduledAt,
					};
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
						body,
					});
					return toItems(response, itemIndex);
				}
				case 'cancelFollowUp': {
					// DELETE /campaigns/:id/follow-ups/:followUpId
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId, followUpId: getString('followUpId') },
					});
					return toItems(response, itemIndex);
				}
				case 'getExecutionStatus': {
					// GET /campaigns/:id/execution-status
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: campaignId },
					});
					return toItems(response, itemIndex);
				}
			}
		}

		// ── LinkedIn Account (read-only) ─────────────────────────────
		if (resource === 'linkedinAccount') {
			switch (operation) {
				case 'get': {
					// GET /accounts/:id
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('accountId') },
					});
					return toItems(response, itemIndex);
				}
				case 'getAll': {
					// GET /accounts
					const response = await request({ method: endpoint.method, path: endpoint.path });
					return toItems(response, itemIndex);
				}
				case 'getStatus': {
					// GET /accounts/:id/status
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('accountId') },
					});
					return toItems(response, itemIndex);
				}
			}
		}

		// ── Conversation ─────────────────────────────────────────────
		if (resource === 'conversation') {
			switch (operation) {
				case 'get': {
					// GET /conversations/:id
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('conversationId') },
					});
					return toItems(response, itemIndex);
				}
				case 'getAll': {
					// GET /conversations?search&channel&unreadOnly&limit&offset
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						qs: {
							search: getString('search') || undefined,
							channel: getString('channel') || undefined,
							unreadOnly: get('unreadOnly', false) ? true : undefined,
							limit: get('limit', 50) as number,
							offset: get('offset', 0) as number,
						},
					});
					return toItems(response, itemIndex);
				}
				case 'search': {
					// GET /search/conversations?q
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						qs: { q: getString('query') },
					});
					return toItems(response, itemIndex);
				}
				case 'getReplies': {
					// GET /conversations/:id — replies live on the conversation
					const conversationId = getString('conversationId');
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: conversationId },
					});
					const replies = (response as IDataObject)?.replies;
					if (Array.isArray(replies)) {
						return replies.map((reply) => ({
							json: { ...(reply as IDataObject), conversationId },
							pairedItem: { item: itemIndex },
						}));
					}
					return toItems(response, itemIndex);
				}
				case 'sendReply': {
					// POST /conversations/:id/replies — EMAIL ONLY. A LinkedIn
					// conversation returns 422 `linkedin_unavailable`; the
					// error is surfaced honestly, never worked around.
					const body: IDataObject = {
						content: getString('content'),
						idempotencyKey: getString('idempotencyKey') || randomUUID(),
					};
					const subject = getString('subject');
					if (subject) body.subject = subject;
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('conversationId') },
						body,
					});
					return toItems(response, itemIndex);
				}
			}
		}

		// ── Analytics ────────────────────────────────────────────────
		if (resource === 'analytics') {
			switch (operation) {
				case 'getCampaignStatistics': {
					// GET /campaigns/:id/performance
					const response = await request({
						method: endpoint.method,
						path: endpoint.path,
						params: { id: getString('campaignId') },
					});
					return toItems(response, itemIndex);
				}
				case 'getLeadStatistics': {
					// GET /usage + GET /leads — counts come from the live
					// responses only; nothing is invented.
					const usage = await request({ method: 'GET', path: '/usage' });
					const leads = await request({ method: 'GET', path: '/leads', qs: { limit: 100 } });
					const listed = Array.isArray(leads)
						? leads.length
						: Array.isArray((leads as IDataObject)?.leads)
							? ((leads as IDataObject).leads as unknown[]).length
							: null;
					return [
						{
							json: { usage: usage as IDataObject, leads: leads as IDataObject, leadsListedCount: listed },
							pairedItem: { item: itemIndex },
						},
					];
				}
				case 'getAccountActivity': {
					// GET /usage
					const response = await request({ method: endpoint.method, path: endpoint.path });
					return toItems(response, itemIndex);
				}
				case 'compareCampaigns': {
					// GET /campaigns/:id/performance x2 — both results returned.
					const campaignAId = getString('campaignAId');
					const campaignBId = getString('campaignBId');
					const [performanceA, performanceB] = await Promise.all([
						request({
							method: endpoint.method,
							path: endpoint.path,
							params: { id: campaignAId },
						}),
						request({
							method: endpoint.method,
							path: endpoint.path,
							params: { id: campaignBId },
						}),
					]);
					return [
						{
							json: {
								campaignAId,
								campaignA: performanceA as IDataObject,
								campaignBId,
								campaignB: performanceB as IDataObject,
							},
							pairedItem: { item: itemIndex },
						},
					];
				}
				case 'getUsageReport': {
					// GET /usage
					const response = await request({ method: endpoint.method, path: endpoint.path });
					return toItems(response, itemIndex);
				}
			}
		}

		throw new NodeOperationError(context.getNode(), `Unhandled operation: ${resource} → ${operation}`, {
			itemIndex,
		});
	}

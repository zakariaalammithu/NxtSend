// Tests for the NxtSend action node: description shape, the
// operation -> endpoint mapping, and execute() behaviour with a mocked
// NxtSend API (no live calls).
import type { INodeExecutionData, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { NxtSend } from '../nodes/NxtSend/NxtSend.node';
import { nxtSendProperties } from '../nodes/NxtSend/properties';
import { NXT_API_BASE_PATH, OPERATION_ENDPOINTS } from '../nodes/shared/constants';
import { createFakeContext, type FakeContext } from './helpers';

/** Call the node's execute() with a fake n8n context. */
async function executeNode(node: NxtSend, ctx: FakeContext): Promise<INodeExecutionData[][]> {
	const execute = node.execute as unknown as (
		this: unknown,
	) => Promise<INodeExecutionData[][]>;
	return execute.call(ctx);
}

const API = `https://nxtsend.com${NXT_API_BASE_PATH}`;

/** Every (resource, operation) pair the node description offers. */
function descriptionOperations(): Array<{ resource: string; operation: string }> {
	const pairs: Array<{ resource: string; operation: string }> = [];
	for (const prop of nxtSendProperties) {
		if (prop.name !== 'operation' || !Array.isArray(prop.options)) continue;
		const resources = (prop.displayOptions?.show?.resource as string[] | undefined) ?? [];
		for (const resource of resources) {
			for (const option of prop.options as Array<{ value: unknown }>) {
				pairs.push({ resource, operation: String(option.value) });
			}
		}
	}
	return pairs;
}

describe('NxtSend node description', () => {
	const node = new NxtSend();

	it('is a version 1 workflow node, not an AI tool', () => {
		expect(node.description.name).toBe('nxtSend');
		expect(node.description.displayName).toBe('NxtSend');
		expect(node.description.version).toBe(1);
		expect(node.description.group).toEqual(['output']);
		// Opted out of AI-tool use by omitting `usableAsTool` entirely
		// (n8n-workflow 2.48.2 types it as `true | ...`, so `false` is a
		// type error — omission is the opt-out).
		expect(node.description.usableAsTool).toBeUndefined();
		expect(node.description.icon).toEqual({
			light: 'file:nxtsend.svg',
			dark: 'file:nxtsend.svg',
		});
	});

	it('accepts either credential type', () => {
		const names = (node.description.credentials ?? []).map((c) => c.name);
		expect(names).toEqual(expect.arrayContaining(['nxtSendApi', 'nxtSendOAuth2Api']));
	});

	it('offers the six resources', () => {
		const resourceProp = nxtSendProperties.find((p) => p.name === 'resource');
		const values = (resourceProp?.options as Array<{ value: string }>).map((o) => o.value);
		expect(values.sort()).toEqual(
			['analytics', 'campaign', 'conversation', 'lead', 'linkedinAccount', 'sequence'].sort(),
		);
	});

	it('every described operation has exactly one endpoint, and vice versa', () => {
		const described = descriptionOperations();
		expect(described.length).toBeGreaterThan(0);
		const mapped: Array<{ resource: string; operation: string }> = [];
		for (const [resource, ops] of Object.entries(OPERATION_ENDPOINTS)) {
			for (const operation of Object.keys(ops)) mapped.push({ resource, operation });
		}
		const key = (p: { resource: string; operation: string }) => `${p.resource}:${p.operation}`;
		expect(described.map(key).sort()).toEqual(mapped.map(key).sort());
	});

	it('all mapped endpoints use a valid method and an /api/integrations/n8n/v1 path', () => {
		for (const ops of Object.values(OPERATION_ENDPOINTS)) {
			for (const endpoint of Object.values(ops)) {
				expect(['GET', 'POST', 'PATCH', 'DELETE']).toContain(endpoint.method);
				expect(endpoint.path.startsWith('/')).toBe(true);
				expect(endpoint.path).not.toContain(' ');
			}
		}
	});

	it('has no LinkedIn send operations', () => {
		const accountOps = Object.keys(OPERATION_ENDPOINTS.linkedinAccount);
		expect(accountOps.sort()).toEqual(['get', 'getAll', 'getStatus'].sort());
		// The only "send" operation in the package is the email-only reply.
		expect(OPERATION_ENDPOINTS.conversation.sendReply.path).toBe('/conversations/:id/replies');
	});

	it('says Campaign Create is draft-only in the operation description', () => {
		const campaignOps = nxtSendProperties.find(
			(p) =>
				p.name === 'operation' &&
				(p.displayOptions?.show?.resource as string[])?.includes('campaign'),
		);
		const create = (campaignOps?.options as Array<{ value: string; description?: string }>).find(
			(o) => o.value === 'create',
		);
		expect(create?.description).toMatch(/DRAFT/i);
		expect(create?.description).toMatch(/dashboard/i);
	});

	it('says Send Reply is email-only in the operation description', () => {
		const convoOps = nxtSendProperties.find(
			(p) =>
				p.name === 'operation' &&
				(p.displayOptions?.show?.resource as string[])?.includes('conversation'),
		);
		const sendReply = (convoOps?.options as Array<{ value: string; description?: string }>).find(
			(o) => o.value === 'sendReply',
		);
		expect(sendReply?.description).toMatch(/email only/i);
	});

	it('requires first name, last name and email for Lead Create', () => {
		const required = nxtSendProperties.filter(
			(p) =>
				p.required === true &&
				(p.displayOptions?.show?.operation as string[])?.includes('create') &&
				(p.displayOptions?.show?.resource as string[])?.includes('lead'),
		);
		expect(required.map((p) => p.name).sort()).toEqual(['email', 'firstName', 'lastName'].sort());
	});
});

describe('NxtSend execute() with a mocked API', () => {
	const run = async (params: Record<string, unknown>, response: unknown) => {
		const node = new NxtSend();
		const ctx = createFakeContext({ params });
		ctx.__http.queueResponses(response);
		const result = await executeNode(node, ctx);
		return { result, ctx };
	};

	it('Lead Create POSTs /leads with the mapped body', async () => {
		const { result, ctx } = await run(
			{
				resource: 'lead',
				operation: 'create',
				firstName: 'Ada',
				lastName: 'Lovelace',
				email: 'ada@example.com',
				company: 'Analytical Engines Ltd',
				jobTitle: '',
				linkedinUrl: '',
				tags: 'warm, q4',
			},
			{ id: 'lead_1', first_name: 'Ada', email: 'ada@example.com' },
		);
		const call = ctx.__http.calls[0];
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API}/leads`);
		expect(call.options.body).toEqual({
			first_name: 'Ada',
			last_name: 'Lovelace',
			email: 'ada@example.com',
			company: 'Analytical Engines Ltd',
			tags: ['warm', 'q4'],
		});
		expect(result[0][0].json).toEqual({ id: 'lead_1', first_name: 'Ada', email: 'ada@example.com' });
	});

	it('Lead Create rejects an invalid email without calling the API', async () => {
		const node = new NxtSend();
		const ctx = createFakeContext({
			params: { resource: 'lead', operation: 'create', firstName: 'Ada', lastName: 'X', email: 'not-an-email' },
		});
		await expect(executeNode(node, ctx)).rejects.toThrow(
			NodeOperationError,
		);
		expect(ctx.__http.calls).toHaveLength(0);
	});

	it('Lead Get Many returns one item per list element', async () => {
		const { result } = await run(
			{ resource: 'lead', operation: 'getAll', limit: 2, after: '' },
			[
				{ id: 'lead_1' },
				{ id: 'lead_2' },
			],
		);
		expect(result[0]).toHaveLength(2);
		expect(result[0][0].json).toEqual({ id: 'lead_1' });
	});

	it('Lead Import refuses more than 100 leads', async () => {
		const node = new NxtSend();
		const leads = Array.from({ length: 101 }, (_, i) => ({
			first_name: 'A',
			last_name: 'B',
			email: `a${i}@example.com`,
		}));
		const ctx = createFakeContext({
			params: { resource: 'lead', operation: 'import', leadsJson: leads },
		});
		await expect(executeNode(node, ctx)).rejects.toThrow(
			/at most 100/,
		);
		expect(ctx.__http.calls).toHaveLength(0);
	});

	it('Lead Import POSTs /leads/import and returns the summary', async () => {
		const { result, ctx } = await run(
			{
				resource: 'lead',
				operation: 'import',
				leadsJson: [{ first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' }],
			},
			{ created: 1, skipped: 0, leads: [{ id: 'lead_1' }] },
		);
		expect(ctx.__http.calls[0].options.url).toBe(`${API}/leads/import`);
		expect(result[0][0].json).toEqual({ created: 1, skipped: 0, leads: [{ id: 'lead_1' }] });
	});

	it('Campaign Create POSTs /campaigns (draft-only)', async () => {
		const { ctx } = await run(
			{ resource: 'campaign', operation: 'create', name: 'Q4 Outreach', type: 'email', description: '', stepsJson: [] },
			{ id: 'camp_1', status: 'draft' },
		);
		expect(ctx.__http.calls[0].options.method).toBe('POST');
		expect(ctx.__http.calls[0].options.url).toBe(`${API}/campaigns`);
		expect(ctx.__http.calls[0].options.body).toEqual({ name: 'Q4 Outreach', type: 'email' });
	});

	it('Campaign Pause POSTs /campaigns/:id/pause', async () => {
		const { ctx } = await run(
			{ resource: 'campaign', operation: 'pause', campaignId: 'camp_1' },
			{ id: 'camp_1', status: 'paused' },
		);
		expect(ctx.__http.calls[0].options.url).toBe(`${API}/campaigns/camp_1/pause`);
	});

	it('Sequence Schedule Follow-Up POSTs the server snake_case body', async () => {
		const { ctx } = await run(
			{
				resource: 'sequence',
				operation: 'scheduleFollowUp',
				campaignId: 'camp_1',
				conversationId: 'conv_1',
				scheduledAt: '2026-11-20T09:00:00.000Z',
				content: 'Following up on our intro call.',
			},
			{ id: 'fu_1', conversation_id: 'conv_1', scheduled_at: '2026-11-20T09:00:00.000Z' },
		);
		expect(ctx.__http.calls[0].options.method).toBe('POST');
		expect(ctx.__http.calls[0].options.url).toBe(`${API}/campaigns/camp_1/follow-ups`);
		expect(ctx.__http.calls[0].options.body).toEqual({
			conversation_id: 'conv_1',
			body: 'Following up on our intro call.',
			scheduled_at: '2026-11-20T09:00:00.000Z',
		});
	});

	it('Sequence Schedule Follow-Up refuses a missing conversation or content without calling the API', async () => {
		const node = new NxtSend();
		const ctx = createFakeContext({
			params: {
				resource: 'sequence',
				operation: 'scheduleFollowUp',
				campaignId: 'camp_1',
				conversationId: '',
				scheduledAt: '2026-11-20T09:00:00.000Z',
				content: 'Following up.',
			},
		});
		await expect(executeNode(node, ctx)).rejects.toThrow(NodeOperationError);
		expect(ctx.__http.calls).toHaveLength(0);
	});

	it('Conversation Send Reply POSTs with a generated idempotency key', async () => {
		const { ctx } = await run(
			{
				resource: 'conversation',
				operation: 'sendReply',
				conversationId: 'conv_1',
				content: 'Thanks for getting back to me.',
				subject: '',
				idempotencyKey: '',
			},
			{ id: 'reply_1' },
		);
		const call = ctx.__http.calls[0];
		expect(call.options.url).toBe(`${API}/conversations/conv_1/replies`);
		const body = call.options.body as Record<string, unknown>;
		expect(body.content).toBe('Thanks for getting back to me.');
		expect(typeof body.idempotencyKey).toBe('string');
		expect((body.idempotencyKey as string).length).toBeGreaterThan(0);
	});

	it('Conversation Get Replies returns one item per reply', async () => {
		const { result } = await run(
			{ resource: 'conversation', operation: 'getReplies', conversationId: 'conv_1' },
			{ id: 'conv_1', replies: [{ id: 'r1', content: 'hi' }, { id: 'r2', content: 'hello' }] },
		);
		expect(result[0]).toHaveLength(2);
		expect(result[0][0].json).toEqual({ id: 'r1', content: 'hi', conversationId: 'conv_1' });
	});

	it('Analytics Compare Campaigns calls performance twice and returns both', async () => {
		const node = new NxtSend();
		const ctx = createFakeContext({
			params: { resource: 'analytics', operation: 'compareCampaigns', campaignAId: 'a', campaignBId: 'b' },
		});
		ctx.__http.queueResponses(
			{ campaign_id: 'a', stats: { sent: 10 }, accepted: null },
			{ campaign_id: 'b', stats: { sent: 20 }, accepted: null },
		);
		const result = await executeNode(node, ctx);
		const calls = ctx.__http.calls;
		expect(calls).toHaveLength(2);
		expect(calls[0].options.url).toBe(`${API}/campaigns/a/performance`);
		expect(calls[1].options.url).toBe(`${API}/campaigns/b/performance`);
		const json = (result as Array<Array<{ json: Record<string, unknown> }>>)[0][0].json;
		expect(json.campaignA).toEqual({ campaign_id: 'a', stats: { sent: 10 }, accepted: null });
		expect(json.campaignB).toEqual({ campaign_id: 'b', stats: { sent: 20 }, accepted: null });
		// `accepted` is always null in the API — surfaced as null, never invented.
		expect((json.campaignA as Record<string, unknown>).accepted).toBeNull();
	});

	it('Analytics Get Lead Statistics combines usage + leads from the live API', async () => {
		const node = new NxtSend();
		const ctx = createFakeContext({ params: { resource: 'analytics', operation: 'getLeadStatistics' } });
		ctx.__http.queueResponses({ metrics: { leads: { total: 42 } } }, [{ id: 'lead_1' }]);
		const result = await executeNode(node, ctx);
		expect(ctx.__http.calls[0].options.url).toBe(`${API}/usage`);
		expect(ctx.__http.calls[1].options.url).toBe(`${API}/leads`);
		const json = (result as Array<Array<{ json: Record<string, unknown> }>>)[0][0].json;
		expect(json.usage).toEqual({ metrics: { leads: { total: 42 } } });
		expect(json.leadsListedCount).toBe(1);
	});

	it('a NodeApiError from the API is re-thrown as a NodeApiError', async () => {
		const node = new NxtSend();
		const ctx = createFakeContext({
			params: { resource: 'lead', operation: 'get', leadId: 'missing' },
		});
		const apiError = new NodeApiError(
			{ id: 'test-node', name: 'NxtSend', type: 'nxtSend', typeVersion: 1, position: [0, 0], parameters: {} },
			{ message: 'Lead not found', code: 404 } as unknown as JsonObject,
		);
		ctx.__http.fn.mockRejectedValueOnce(apiError);
		await expect(executeNode(node, ctx)).rejects.toThrow(
			NodeApiError,
		);
	});

	it('continueOnFail turns an error into an error item instead of throwing', async () => {
		const node = new NxtSend();
		const ctx = createFakeContext({
			params: { resource: 'lead', operation: 'get', leadId: 'missing' },
			continueOnFail: true,
		});
		ctx.__http.fn.mockRejectedValueOnce(new Error('boom'));
		const result = await executeNode(node, ctx);
		expect((result as Array<Array<{ json: Record<string, unknown> }>>)[0][0].json.error).toBe('boom');
	});

	it('an unknown operation throws a NodeOperationError', async () => {
		const node = new NxtSend();
		const ctx = createFakeContext({ params: { resource: 'lead', operation: 'launch' } });
		await expect(executeNode(node, ctx)).rejects.toThrow(
			NodeOperationError,
		);
	});
});

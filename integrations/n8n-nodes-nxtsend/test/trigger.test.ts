// Tests for the shared pure helpers (dropdown normalisation, polling
// dedupe, webhook envelope) and the trigger node's webhook lifecycle +
// polling behaviour with mocked HTTP.
import { NxtSendTrigger } from '../nodes/NxtSendTrigger/NxtSendTrigger.node';
import { NXT_API_BASE_PATH, NXT_EVENTS } from '../nodes/shared/constants';
import {
	buildPath,
	filterNewItems,
	normalizeDropdownOptions,
	webhookEnvelopeToItem,
} from '../nodes/shared/api';
import { createFakeContext } from './helpers';

const API = `https://nxtsend.com${NXT_API_BASE_PATH}`;

describe('buildPath', () => {
	it('substitutes and URL-encodes :params', () => {
		expect(buildPath('/leads/:id', { id: 'lead 1' })).toBe('/leads/lead%201');
		expect(buildPath('/campaigns/:id/steps', { id: 'camp_1' })).toBe('/campaigns/camp_1/steps');
		expect(buildPath('/leads')).toBe('/leads');
	});
});

describe('normalizeDropdownOptions', () => {
	it('maps {id, name} objects', () => {
		expect(normalizeDropdownOptions([{ id: 'c1', name: 'Q4 Outreach' }])).toEqual([
			{ name: 'Q4 Outreach', value: 'c1' },
		]);
	});

	it('maps {value, label} objects and plain strings', () => {
		expect(normalizeDropdownOptions([{ value: 'a', label: 'Alpha' }, 'beta'])).toEqual([
			{ name: 'Alpha', value: 'a' },
			{ name: 'beta', value: 'beta' },
		]);
	});

	it('unwraps a {data: [...]} envelope', () => {
		expect(normalizeDropdownOptions({ data: [{ id: '1', name: 'One' }] })).toEqual([
			{ name: 'One', value: '1' },
		]);
	});

	it('returns [] for empty and error payloads (never throws)', () => {
		expect(normalizeDropdownOptions([])).toEqual([]);
		expect(normalizeDropdownOptions({ error: 'unauthorized' })).toEqual([]);
		expect(normalizeDropdownOptions(null)).toEqual([]);
		expect(normalizeDropdownOptions(undefined)).toEqual([]);
		expect(normalizeDropdownOptions([{ name: 'No id here' }])).toEqual([]);
	});
});

describe('filterNewItems (polling dedupe)', () => {
	const items = [
		{ id: '1', created_at: '2026-11-17T10:00:00.000Z' },
		{ id: '2', created_at: '2026-11-17T11:00:00.000Z' },
		{ id: '3', created_at: '2026-11-17T12:00:00.000Z' },
	];

	it('first poll emits nothing and establishes the cursor', () => {
		const result = filterNewItems(items, 'created_at', undefined, []);
		expect(result.newItems).toEqual([]);
		expect(result.newLastSeenAt).toBe('2026-11-17T12:00:00.000Z');
		expect(result.newSeenIds).toEqual(['3']);
	});

	it('second poll returns only newer items', () => {
		const first = filterNewItems(items, 'created_at', undefined, []);
		const later = [
			...items,
			{ id: '4', created_at: '2026-11-17T13:00:00.000Z' },
		];
		const second = filterNewItems(later, 'created_at', first.newLastSeenAt, first.newSeenIds);
		expect(second.newItems).toEqual([{ id: '4', created_at: '2026-11-17T13:00:00.000Z' }]);
	});

	it('dedupes items exactly at the cursor by id', () => {
		const atCursor = filterNewItems(items, 'created_at', '2026-11-17T12:00:00.000Z', ['3']);
		expect(atCursor.newItems).toEqual([]);
		const unseen = filterNewItems(
			[...items, { id: '4', created_at: '2026-11-17T12:00:00.000Z' }],
			'created_at',
			'2026-11-17T12:00:00.000Z',
			['3'],
		);
		expect(unseen.newItems).toEqual([{ id: '4', created_at: '2026-11-17T12:00:00.000Z' }]);
	});

	it('ignores items without a usable timestamp and sorts oldest-first', () => {
		const mixed = [
			{ id: '9', created_at: '2026-11-17T12:00:00.000Z' },
			{ id: '8' },
			{ id: '7', created_at: '2026-11-17T09:00:00.000Z' },
		];
		const result = filterNewItems(mixed, 'created_at', '2026-11-17T08:00:00.000Z', []);
		expect(result.newItems.map((i) => i.id)).toEqual(['7', '9']);
	});
});

describe('webhookEnvelopeToItem', () => {
	it('returns data plus event/eventId', () => {
		expect(
			webhookEnvelopeToItem({
				id: 'evt_1',
				type: 'lead.created',
				created_at: '2026-11-17T10:00:00Z',
				workspace_id: 'ws_1',
				data: { id: 'lead_1', email: 'ada@example.com' },
			}),
		).toEqual({ id: 'lead_1', email: 'ada@example.com', event: 'lead.created', eventId: 'evt_1' });
	});
});

describe('NxtSendTrigger node', () => {
	const trigger = new NxtSendTrigger();

	it('offers exactly the 9 supported events — no LinkedIn-accepted event', () => {
		const values = NXT_EVENTS.map((e) => e.value);
		expect(values).toHaveLength(9);
		expect(values).toContain('conversation.created');
		expect(values).not.toContain('lead.linkedin_accepted');
		expect(values).not.toContain('linkedin.connection_accepted');
		const eventProp = trigger.description.properties.find((p) => p.name === 'event');
		expect((eventProp?.options as Array<{ value: string }>).map((o) => o.value).sort()).toEqual(
			values.sort(),
		);
	});

	it('defaults to webhook mode and is a version 1 trigger', () => {
		expect(trigger.description.group).toEqual(['trigger']);
		expect(trigger.description.version).toBe(1);
		expect(trigger.description.inputs).toEqual([]);
		expect(trigger.description.usableAsTool).toBeUndefined();
		const modeProp = trigger.description.properties.find((p) => p.name === 'mode');
		expect(modeProp?.default).toBe('webhook');
	});

	it('webhook() emits the envelope data with event/eventId', async () => {
		const ctx = createFakeContext({
			bodyData: {
				id: 'evt_9',
				type: 'campaign.status_changed',
				created_at: '2026-11-17T10:00:00Z',
				workspace_id: 'ws_1',
				data: { id: 'camp_1', status: 'paused' },
			},
		});
		const webhook = trigger.webhook as unknown as (this: unknown) => Promise<{
			workflowData: Array<Array<{ json: Record<string, unknown> }>>;
		}>;
		const response = await webhook.call(ctx);
		expect(response.workflowData[0][0].json).toEqual({
			id: 'camp_1',
			status: 'paused',
			event: 'campaign.status_changed',
			eventId: 'evt_9',
		});
	});

	it('webhookMethods.create subscribes with the event + webhook URL', async () => {
		const ctx = createFakeContext({
			params: { event: 'lead.created' },
			webhookUrl: 'https://n8n.example.com/webhook/abc',
		});
		const create = trigger.webhookMethods?.default?.create as unknown as (
			this: unknown,
		) => Promise<boolean>;
		await expect(create.call(ctx)).resolves.toBe(true);
		const call = ctx.__http.calls[0];
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API}/webhooks/subscribe`);
		expect(call.options.body).toEqual({
			event: 'lead.created',
			target_url: 'https://n8n.example.com/webhook/abc',
		});
	});

	it('webhookMethods.create refuses conversation.created (polling-only)', async () => {
		const ctx = createFakeContext({
			params: { event: 'conversation.created' },
			webhookUrl: 'https://n8n.example.com/webhook/abc',
		});
		const create = trigger.webhookMethods?.default?.create as unknown as (
			this: unknown,
		) => Promise<boolean>;
		await expect(create.call(ctx)).rejects.toThrow(/polling-only/);
		expect(ctx.__http.calls).toHaveLength(0);
	});

	it('webhookMethods.checkExists matches an existing subscription by URL', async () => {
		const ctx = createFakeContext({ webhookUrl: 'https://n8n.example.com/webhook/abc' });
		ctx.__http.queueResponses([
			{ id: 'sub_1', event: 'lead.created', target_url: 'https://n8n.example.com/webhook/abc' },
			{ id: 'sub_2', event: 'lead.updated', target_url: 'https://n8n.example.com/webhook/other' },
		]);
		const checkExists = trigger.webhookMethods?.default?.checkExists as unknown as (
			this: unknown,
		) => Promise<boolean>;
		await expect(checkExists.call(ctx)).resolves.toBe(true);
		expect(ctx.__http.calls[0].options.url).toBe(`${API}/webhooks/subscriptions`);
	});

	it('webhookMethods.checkExists is false when no subscription matches', async () => {
		const ctx = createFakeContext({ webhookUrl: 'https://n8n.example.com/webhook/abc' });
		ctx.__http.queueResponses([
			{ id: 'sub_2', event: 'lead.updated', target_url: 'https://n8n.example.com/webhook/other' },
		]);
		const checkExists = trigger.webhookMethods?.default?.checkExists as unknown as (
			this: unknown,
		) => Promise<boolean>;
		await expect(checkExists.call(ctx)).resolves.toBe(false);
	});

	it('webhookMethods.delete unsubscribes the subscription matching the URL', async () => {
		const ctx = createFakeContext({ webhookUrl: 'https://n8n.example.com/webhook/abc' });
		ctx.__http.queueResponses([
			{ id: 'sub_1', event: 'lead.created', target_url: 'https://n8n.example.com/webhook/abc' },
		]);
		const remove = trigger.webhookMethods?.default?.delete as unknown as (
			this: unknown,
		) => Promise<boolean>;
		await expect(remove.call(ctx)).resolves.toBe(true);
		expect(ctx.__http.calls[1].options.url).toBe(`${API}/webhooks/unsubscribe`);
		expect(ctx.__http.calls[1].options.body).toEqual({ id: 'sub_1' });
	});

	it('poll() first run returns null and stores the cursor; second run returns only new leads', async () => {
		const ctx = createFakeContext({ params: { event: 'lead.created' } });
		const poll = trigger.poll as unknown as (this: unknown) => Promise<unknown>;
		ctx.__http.queueResponses([
			{ id: 'lead_1', created_at: '2026-11-17T10:00:00.000Z' },
			{ id: 'lead_2', created_at: '2026-11-17T11:00:00.000Z' },
		]);
		await expect(poll.call(ctx)).resolves.toBeNull();
		expect(ctx.__staticData.lastSeenAt).toBe('2026-11-17T11:00:00.000Z');

		ctx.__http.queueResponses([
			{ id: 'lead_1', created_at: '2026-11-17T10:00:00.000Z' },
			{ id: 'lead_2', created_at: '2026-11-17T11:00:00.000Z' },
			{ id: 'lead_3', created_at: '2026-11-17T12:00:00.000Z' },
		]);
		const second = (await poll.call(ctx)) as Array<Array<{ json: Record<string, unknown> }>>;
		expect(second).toHaveLength(1);
		expect(second[0]).toHaveLength(1);
		expect(second[0][0].json.id).toBe('lead_3');
		expect(second[0][0].json.event).toBe('lead.created');
		expect(second[0][0].json.eventId).toBe('lead_3');
	});

	it('poll() returns null when nothing is new', async () => {
		const ctx = createFakeContext({
			params: { event: 'campaign.created' },
			staticData: { lastSeenAt: '2026-11-17T12:00:00.000Z', seenIds: ['camp_1'] },
		});
		const poll = trigger.poll as unknown as (this: unknown) => Promise<unknown>;
		ctx.__http.queueResponses([{ id: 'camp_1', created_at: '2026-11-17T12:00:00.000Z' }]);
		await expect(poll.call(ctx)).resolves.toBeNull();
	});

	it('poll() emits only new conversations for conversation.created', async () => {
		const ctx = createFakeContext({ params: { event: 'conversation.created' } });
		const poll = trigger.poll as unknown as (this: unknown) => Promise<unknown>;
		ctx.__http.queueResponses([
			{ id: 'conv_1', created_at: '2026-11-17T10:00:00.000Z' },
		]);
		await expect(poll.call(ctx)).resolves.toBeNull();

		ctx.__http.queueResponses([
			{ id: 'conv_1', created_at: '2026-11-17T10:00:00.000Z' },
			{ id: 'conv_2', created_at: '2026-11-17T11:00:00.000Z' },
		]);
		const second = (await poll.call(ctx)) as Array<Array<{ json: Record<string, unknown> }>>;
		expect(second).toHaveLength(1);
		expect(second[0]).toHaveLength(1);
		expect(second[0][0].json.id).toBe('conv_2');
		expect(second[0][0].json.event).toBe('conversation.created');
		expect(second[0][0].json.eventId).toBe('conv_2');
	});
});

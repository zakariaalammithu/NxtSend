// Tests for the node's loadOptions methods (dynamic dropdowns): success,
// empty, and error cases. The methods must never throw — a failing
// dropdown returns [] so the node UI keeps working.
import { NxtSend } from '../nodes/NxtSend/NxtSend.node';
import { createFakeContext } from './helpers';

async function callLoadOption(
	node: NxtSend,
	method: string,
	ctx: ReturnType<typeof createFakeContext>,
): Promise<unknown> {
	const fn = (node.methods?.loadOptions as Record<string, unknown>)[method] as (
		this: unknown,
	) => Promise<unknown>;
	return fn.call(ctx);
}

describe('loadOptions', () => {
	const node = new NxtSend();

	it('getCampaigns maps the dropdown endpoint response', async () => {
		const ctx = createFakeContext();
		ctx.__http.queueResponses([{ id: 'c1', name: 'Q4 Outreach' }, { id: 'c2', name: 'Spring' }]);
		await expect(callLoadOption(node, 'getCampaigns', ctx)).resolves.toEqual([
			{ name: 'Q4 Outreach', value: 'c1' },
			{ name: 'Spring', value: 'c2' },
		]);
		expect(ctx.__http.calls[0].options.url).toBe(
			'https://nxtsend.com/api/integrations/n8n/v1/dropdowns/campaigns',
		);
	});

	it('getAccounts maps the dropdown endpoint response', async () => {
		const ctx = createFakeContext();
		ctx.__http.queueResponses([{ id: 'a1', name: 'Zakaria — LinkedIn' }]);
		await expect(callLoadOption(node, 'getAccounts', ctx)).resolves.toEqual([
			{ name: 'Zakaria — LinkedIn', value: 'a1' },
		]);
	});

	it('getLeadStatuses maps the dropdown endpoint response', async () => {
		const ctx = createFakeContext();
		ctx.__http.queueResponses([{ id: 'new', name: 'New' }, { id: 'contacted', name: 'Contacted' }]);
		await expect(callLoadOption(node, 'getLeadStatuses', ctx)).resolves.toEqual([
			{ name: 'New', value: 'new' },
			{ name: 'Contacted', value: 'contacted' },
		]);
	});

	it('getSequences is campaign-scoped and empty without a campaign', async () => {
		const noCampaign = createFakeContext({ currentParams: {} });
		await expect(callLoadOption(node, 'getSequences', noCampaign)).resolves.toEqual([]);
		expect(noCampaign.__http.calls).toHaveLength(0);

		const withCampaign = createFakeContext({ currentParams: { campaignId: 'camp_1' } });
		withCampaign.__http.queueResponses([{ id: 's1', name: 'Step 1 — Email' }]);
		await expect(callLoadOption(node, 'getSequences', withCampaign)).resolves.toEqual([
			{ name: 'Step 1 — Email', value: 's1' },
		]);
		expect(withCampaign.__http.calls[0].options.url).toBe(
			'https://nxtsend.com/api/integrations/n8n/v1/dropdowns/sequences',
		);
		expect(withCampaign.__http.calls[0].options.qs).toEqual({ campaign_id: 'camp_1' });
	});

	it('getConversations lists inbox conversations by subject then contact', async () => {
		const ctx = createFakeContext();
		ctx.__http.queueResponses({
			conversations: [
				{ id: 'conv_1', subject: 'Re: Q4 pricing', contact_name: 'Ada', contact_email: 'ada@example.com' },
				{ id: 'conv_2', subject: null, contact_name: 'Grace', contact_email: 'grace@example.com' },
			],
			count: 2,
		});
		await expect(callLoadOption(node, 'getConversations', ctx)).resolves.toEqual([
			{ name: 'Re: Q4 pricing', value: 'conv_1' },
			{ name: 'Grace', value: 'conv_2' },
		]);
		expect(ctx.__http.calls[0].options.url).toBe(
			'https://nxtsend.com/api/integrations/n8n/v1/conversations',
		);
	});

	it('getConversations returns [] when there are no conversations', async () => {
		const ctx = createFakeContext();
		ctx.__http.queueResponses({ conversations: [], count: 0 });
		await expect(callLoadOption(node, 'getConversations', ctx)).resolves.toEqual([]);
	});

	it('an empty dropdown response yields []', async () => {
		const ctx = createFakeContext();
		ctx.__http.queueResponses([]);
		await expect(callLoadOption(node, 'getCampaigns', ctx)).resolves.toEqual([]);
	});

	it('a failing dropdown request yields [] instead of throwing', async () => {
		const ctx = createFakeContext();
		ctx.__http.fn.mockRejectedValueOnce(new Error('503 Service Unavailable'));
		await expect(callLoadOption(node, 'getCampaigns', ctx)).resolves.toEqual([]);
	});
});

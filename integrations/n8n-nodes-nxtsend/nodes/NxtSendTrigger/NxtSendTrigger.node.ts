// NxtSend trigger node: webhook mode (default) or polling mode.
//
// Webhook mode: n8n's webhook lifecycle calls the `webhookMethods`
// (checkExists / create / delete) on activate/deactivate. `create`
// subscribes at POST /webhooks/subscribe with the n8n webhook URL and the
// selected event; `delete` unsubscribes. `webhook()` returns the envelope's
// `data` plus `event` / `eventId` fields.
//
// Polling mode: `poll()` lists via the matching list endpoint, keeps only
// records newer than the stored cursor (workflow static data), dedupes by
// record id, and returns new items only. The first poll emits nothing —
// it only establishes the cursor, so activating the workflow does not
// replay history.
//
// Events: the same 8 as the API contract. There is NO
// LinkedIn-connection-accepted event (it does not exist in NxtSend).
import type {
	IDataObject,
	IHookFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { NXT_EVENTS, POLL_ENDPOINTS } from '../shared/constants';
import { filterNewItems, nxtsendApiRequest, webhookEnvelopeToItem } from '../shared/api';

async function listSubscriptions(this: IHookFunctions): Promise<IDataObject[]> {
	const response = await nxtsendApiRequest.call(this, {
		method: 'GET',
		path: '/webhooks/subscriptions',
	});
	if (Array.isArray(response)) return response as IDataObject[];
	if (Array.isArray((response as IDataObject)?.subscriptions)) {
		return (response as IDataObject).subscriptions as IDataObject[];
	}
	return [];
}

export class NxtSendTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NxtSend Trigger',
		name: 'nxtSendTrigger',
		icon: { light: 'file:nxtsend.svg', dark: 'file:nxtsend.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description:
			'Triggers on NxtSend events — leads, campaigns, conversations and subscriptions — via webhook or polling.',
		defaults: {
			name: 'NxtSend Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{ name: 'nxtSendApi', required: true },
			{ name: 'nxtSendOAuth2Api', required: true },
		],
		// NOTE: deliberately no `usableAsTool` — workflow/trigger node, not an
		// AI tool (see NxtSend.node.ts for why the field is omitted).
		properties: [
			{
				displayName: 'Trigger Mode',
				name: 'mode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Webhook',
						value: 'webhook',
						description: 'NxtSend pushes events to n8n as they happen (recommended)',
					},
					{
						name: 'Polling',
						value: 'polling',
						description: 'N8n polls the NxtSend API for new records',
					},
				],
				default: 'webhook',
				description: 'Webhook mode needs a reachable n8n URL; polling mode works anywhere but only sees new records',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: NXT_EVENTS.map((event) => ({ name: event.name, value: event.value })),
				default: 'lead.created',
				description: 'NxtSend event to trigger on',
			},
		],
	};

	webhookMethods = {
		default: {
			// GET /webhooks/subscriptions — true when a subscription already
			// exists for this node's webhook URL.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) return false;
				const subscriptions = await listSubscriptions.call(this);
				return subscriptions.some((sub) => sub.target_url === webhookUrl);
			},
			// POST /webhooks/subscribe {event, target_url}
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;
				if (!webhookUrl) {
					throw new NodeOperationError(this.getNode(), 'Could not determine the webhook URL.');
				}
				// conversation.created has no webhook event source on the
				// server — it is polling-only. Refuse loudly instead of
				// registering a subscription the server can never fire.
				if (event === 'conversation.created') {
					throw new NodeOperationError(
						this.getNode(),
						'Conversation Created is polling-only: NxtSend emits no webhook event for new conversations. Switch this trigger to polling mode.',
					);
				}
				await nxtsendApiRequest.call(this, {
					method: 'POST',
					path: '/webhooks/subscribe',
					body: { event, target_url: webhookUrl },
				});
				return true;
			},
			// POST /webhooks/unsubscribe {id} — the id is looked up by URL,
			// so deactivation removes exactly this node's subscription.
			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) return false;
				const subscriptions = await listSubscriptions.call(this);
				const match = subscriptions.find((sub) => sub.target_url === webhookUrl);
				if (!match?.id) return false;
				await nxtsendApiRequest.call(this, {
					method: 'POST',
					path: '/webhooks/unsubscribe',
					body: { id: match.id },
				});
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const envelope = this.getBodyData();
		return {
			workflowData: [[{ json: webhookEnvelopeToItem(envelope) }]],
		};
	}

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const pollConfig = POLL_ENDPOINTS[event];
		if (!pollConfig) {
			throw new NodeOperationError(this.getNode(), `Polling is not supported for event "${event}".`);
		}

		const staticData = this.getWorkflowStaticData('node') as IDataObject;

		// subscription.changed has no timestamped list endpoint: poll the
		// subscription list and emit subscriptions never seen before.
		if (event === 'subscription.changed') {
			const subscriptions = (await nxtsendApiRequest.call(this, {
				method: 'GET',
				path: pollConfig.path,
			})) as IDataObject[];
			const list = Array.isArray(subscriptions)
				? subscriptions
				: ((subscriptions as unknown as IDataObject)?.subscriptions as IDataObject[]) ?? [];
			const seenIds = new Set((staticData.seenSubscriptionIds as string[] | undefined) ?? []);
			const fresh = list.filter((sub) => sub.id && !seenIds.has(String(sub.id)));
			staticData.seenSubscriptionIds = list.map((sub) => String(sub.id ?? '')).filter(Boolean);
			if (fresh.length === 0) return null;
			return [
				fresh.map((sub) => ({
					json: { ...sub, event, eventId: String(sub.id) },
				})),
			];
		}

		const response = await nxtsendApiRequest.call(this, {
			method: 'GET',
			path: pollConfig.path,
			qs: { limit: 100 },
		});
		const list = Array.isArray(response)
			? (response as IDataObject[])
			: Array.isArray((response as IDataObject)?.data)
				? ((response as IDataObject).data as IDataObject[])
				: [];

		const { newItems, newLastSeenAt, newSeenIds } = filterNewItems(
			list,
			pollConfig.timestampField,
			staticData.lastSeenAt as string | undefined,
			(staticData.seenIds as string[] | undefined) ?? [],
		);
		staticData.lastSeenAt = newLastSeenAt;
		staticData.seenIds = newSeenIds;

		if (newItems.length === 0) return null;
		return [
			newItems.map((item) => ({
				json: { ...item, event, eventId: String(item.id ?? '') },
			})),
		];
	}
}

// Shared HTTP + polling helpers for the NxtSend nodes.
//
// Design notes:
// - Both credential types (API key `nxtSendApi` and OAuth2
//   `nxtSendOAuth2Api`) resolve to the same workspace, so the node lists
//   both and picks whichever one the user attached, via
//   `this.getNode().credentials`.
// - All requests go through `httpRequestWithAuthentication` — no external
//   HTTP libraries. Non-2xx responses surface as `NodeApiError` carrying
//   the API's error body (that is n8n's built-in behaviour for
//   `httpRequest*`); the node code re-throws those untouched.
import type {
	IAllExecuteFunctions,
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IPollFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';

import { DEFAULT_BASE_URL, NXT_API_BASE_PATH } from './constants';

export type NxtSendRequestContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IPollFunctions
	| IWebhookFunctions;

// Credential *type names* (not secrets — just the identifiers n8n uses to
// resolve which credential a node instance is configured with).
export const API_KEY_TYPE = 'nxtSendApi';
// eslint-disable-next-line @n8n/community-nodes/no-hardcoded-secrets -- 'nxtSendOAuth2Api' is the credential type name, not a secret value.
export const OAUTH2_TYPE = 'nxtSendOAuth2Api';

/** Which credential type the node instance is configured with. */
export function resolveCredentialType(context: NxtSendRequestContext): string {
	const credentials = context.getNode().credentials ?? {};
	return credentials[OAUTH2_TYPE] ? OAUTH2_TYPE : API_KEY_TYPE;
}

/** Base URL from the active credential (`baseUrl` field, default https://nxtsend.com). */
export async function getApiBaseUrl(context: NxtSendRequestContext): Promise<string> {
	const credentialType = resolveCredentialType(context);
	const credentials = (await context.getCredentials<{
		baseUrl?: string;
	}>(credentialType)) as { baseUrl?: string };
	const baseUrl = (credentials?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
	return `${baseUrl}${NXT_API_BASE_PATH}`;
}

export interface NxtSendRequestOptions {
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	/** Path template, e.g. `/leads/:id` — `:param` segments are substituted. */
	path: string;
	params?: Record<string, string | number>;
	/** Query string values (undefined values are dropped). */
	qs?: Record<string, string | number | boolean | undefined>;
	body?: IDataObject;
}

/** Substitute `:param` segments in a path template. */
export function buildPath(path: string, params: Record<string, string | number> = {}): string {
	let built = path;
	for (const [key, value] of Object.entries(params)) {
		built = built.replace(`:${key}`, encodeURIComponent(String(value)));
	}
	return built;
}

/**
 * Authenticated request against the NxtSend n8n API.
 * `this` must be an n8n function context (execute / loadOptions / hook /
 * poll / webhook). Throws `NodeApiError` on non-2xx, with the API's error body.
 */
export async function nxtsendApiRequest(
	this: NxtSendRequestContext,
	options: NxtSendRequestOptions,
): Promise<unknown> {
	const credentialType = resolveCredentialType(this);
	const baseUrl = await getApiBaseUrl(this);

	const qs: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(options.qs ?? {})) {
		if (value !== undefined && value !== '' && value !== null) qs[key] = value;
	}

	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${baseUrl}${buildPath(options.path, options.params)}`,
		qs,
		body: options.body,
		json: true,
	};

	// `httpRequestWithAuthentication` needs the n8n function context as `this`.
	return this.helpers.httpRequestWithAuthentication.call(
		this as unknown as IAllExecuteFunctions,
		credentialType,
		requestOptions,
	);
}

/**
 * Normalise a dropdown-list response into n8n options.
 * The API returns `{id, name}` objects (or `{value, label}`); plain
 * strings and `{data: [...]}` wrappers are tolerated. Anything else —
 * including an error payload — yields an empty list (never throws, so a
 * failing dropdown never breaks the node UI).
 */
export function normalizeDropdownOptions(response: unknown): INodePropertyOptions[] {
	const list = Array.isArray(response)
		? response
		: (response as IDataObject | null)?.data && Array.isArray((response as IDataObject).data)
			? ((response as IDataObject).data as unknown[])
			: [];
	const options: INodePropertyOptions[] = [];
	for (const entry of list) {
		if (typeof entry === 'string') {
			options.push({ name: entry, value: entry });
			continue;
		}
		if (entry && typeof entry === 'object') {
			const record = entry as IDataObject;
			const value = record.id ?? record.value;
			const name = record.name ?? record.label ?? record.title ?? value;
			if (value !== undefined && value !== null && value !== '') {
				options.push({ name: String(name), value: String(value) });
			}
		}
	}
	return options;
}

export interface PollFilterResult {
	/** Items newer than the stored cursor, oldest first. */
	newItems: IDataObject[];
	/** Cursor to persist: newest timestamp seen (or the previous one). */
	newLastSeenAt: string | undefined;
	/** Ids seen at the newest timestamp (boundary dedupe for the next poll). */
	newSeenIds: string[];
}

/**
 * Polling dedupe (pure, unit-tested): keep items whose timestamp is newer
 * than the stored cursor; items exactly at the cursor are only kept when
 * their id was not seen on the previous poll. Items without a usable
 * timestamp are never emitted (they cannot be ordered safely).
 * The first poll (no cursor) emits nothing — it only establishes the cursor.
 */
export function filterNewItems(
	items: IDataObject[],
	timestampField: string,
	lastSeenAt: string | undefined,
	seenIds: string[],
): PollFilterResult {
	const withTime = items
		.map((item) => {
			const raw = item[timestampField];
			const time = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw).getTime() : NaN;
			return { item, time };
		})
		.filter((entry) => !Number.isNaN(entry.time))
		.sort((a, b) => a.time - b.time);

	if (!lastSeenAt) {
		const newest = withTime.length > 0 ? withTime[withTime.length - 1].time : undefined;
		return {
			newItems: [],
			newLastSeenAt: newest !== undefined ? new Date(newest).toISOString() : undefined,
			newSeenIds:
				newest !== undefined
					? withTime.filter((entry) => entry.time === newest).map((entry) => String(entry.item.id ?? ''))
					: [],
		};
	}

	const cursor = new Date(lastSeenAt).getTime();
	const seen = new Set(seenIds);
	const newItems = withTime
		.filter(({ item, time }) => time > cursor || (time === cursor && !seen.has(String(item.id ?? ''))))
		.map(({ item }) => item);

	const newest = withTime.length > 0 ? withTime[withTime.length - 1].time : undefined;
	const newLastSeenAt =
		newest !== undefined && newest > cursor
			? new Date(newest).toISOString()
			: lastSeenAt;
	const newSeenIds =
		newest !== undefined
			? withTime
					.filter((entry) => entry.time === newest)
					.map((entry) => String(entry.item.id ?? ''))
					.filter((id) => id !== '')
			: seenIds;
	return { newItems, newLastSeenAt, newSeenIds };
}

/**
 * Turn a NxtSend webhook envelope `{id, type, created_at, workspace_id,
 * data}` into the item the trigger emits: the envelope's `data` plus the
 * `event` (type) and `eventId` (envelope id) fields.
 */
export function webhookEnvelopeToItem(envelope: IDataObject): IDataObject {
	const data = (envelope.data ?? {}) as IDataObject;
	return {
		...data,
		event: envelope.type,
		eventId: envelope.id,
	};
}

// Shared fakes for testing the NxtSend nodes without a live n8n instance
// or a live NxtSend API. The fakes mimic the n8n function contexts
// (IExecuteFunctions / ILoadOptionsFunctions / IHookFunctions /
// IPollFunctions / IWebhookFunctions) closely enough for the code under
// test: `getNode`, `getCredentials`, `getNodeParameter`,
// `getCurrentNodeParameter`, `getWorkflowStaticData`, `getNodeWebhookUrl`,
// `getBodyData`, `getInputData`, `continueOnFail`, and
// `helpers.httpRequestWithAuthentication`.
//
// NOTE: `@jest/globals` is imported (not the ambient UMD global) so this
// file also type-checks under the repo root's tsconfig, which includes this
// package's test files in its `next build` type check. Tests run under Jest
// on Node and are never shipped to n8n (the published package only contains
// dist/), so the n8n Cloud import restriction does not apply here.
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import { jest } from '@jest/globals';
import type { IDataObject } from 'n8n-workflow';

export interface FakeHttpCall {
	credentialType: string;
	options: {
		method?: string;
		url?: string;
		qs?: Record<string, unknown>;
		body?: unknown;
	};
}

export function createHttpMock() {
	const calls: FakeHttpCall[] = [];
	const responses: unknown[] = [];
	const fn = jest.fn(async (credentialType: string, options: FakeHttpCall['options']) => {
		calls.push({ credentialType, options });
		if (responses.length > 0) return responses.shift();
		return {};
	});
	return {
		fn,
		calls,
		/** Queue responses in call order (each call consumes one). */
		queueResponses: (...values: unknown[]) => {
			responses.push(...values);
		},
	};
}

export interface FakeContextOptions {
	/** Node parameters returned by getNodeParameter. */
	params?: Record<string, unknown>;
	/** Input items returned by getInputData. */
	items?: IDataObject[];
	/** continueOnFail() return value. */
	continueOnFail?: boolean;
	/** Credential data returned by getCredentials. */
	credentials?: Record<string, unknown>;
	/** Credentials attached to the node (getNode().credentials). */
	nodeCredentials?: Record<string, { id: string | null; name: string }>;
	/** Webhook URL returned by getNodeWebhookUrl. */
	webhookUrl?: string;
	/** Body returned by getBodyData (trigger webhook). */
	bodyData?: IDataObject;
	/** Static data object returned by getWorkflowStaticData. */
	staticData?: IDataObject;
	/** Current node parameter (getCurrentNodeParameter, for loadOptions). */
	currentParams?: Record<string, unknown>;
}

export function createFakeContext(options: FakeContextOptions = {}) {
	const http = createHttpMock();
	const staticData: IDataObject = options.staticData ?? {};
	const context = {
		getNode: () => ({
			name: 'NxtSend',
			type: 'nxtSend',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
			credentials: options.nodeCredentials ?? {
				nxtSendApi: { id: '1', name: 'NxtSend API' },
			},
		}),
		getCredentials: async () =>
			options.credentials ?? { baseUrl: 'https://nxtsend.com', apiKey: 'nxt_live_test' },
		getNodeParameter: (name: string, _index?: number, fallback?: unknown) =>
			options.params?.[name] ?? fallback,
		getCurrentNodeParameter: (name: string) => options.currentParams?.[name],
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => options.webhookUrl,
		getBodyData: () => options.bodyData ?? {},
		getInputData: () => (options.items ?? [{}]).map((json) => ({ json })),
		continueOnFail: () => options.continueOnFail ?? false,
		helpers: { httpRequestWithAuthentication: http.fn },
		__http: http,
		__staticData: staticData,
	};
	return context;
}

export type FakeContext = ReturnType<typeof createFakeContext>;

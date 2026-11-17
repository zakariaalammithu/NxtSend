// NxtSend OAuth2 credential.
//
// Extends n8n's built-in OAuth2 credential (`oAuth2Api`): the authorization
// code flow, token storage and refresh are handled by n8n. Scopes
// `n8n.read n8n.write` are the scopes the NxtSend n8n API accepts.
//
// NOTE: the task brief for this package originally named the base
// credential `oAuth2`; the built-in credential is actually named
// `oAuth2Api` (see n8n-workflow's `credentialTypes` / `extends:oAuth2Api`),
// so that is what is extended here.
import type { ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

import { DEFAULT_BASE_URL, NXT_API_BASE_PATH } from '../nodes/shared/constants';

export class NxtSendOAuth2Api implements ICredentialType {
	name = 'nxtSendOAuth2Api';

	displayName = 'NxtSend OAuth2 API';

	icon: Icon = { light: 'file:nxtsend.svg', dark: 'file:nxtsend.svg' };

	documentationUrl = 'https://github.com/zakariaalammithu/NxtSend/tree/main/integrations/n8n-nodes-nxtsend#credentials';

	extends = ['oAuth2Api'];

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: DEFAULT_BASE_URL,
			placeholder: 'https://nxtsend.com',
			description:
				'Base URL of your NxtSend instance. The authorization and token URLs are derived from it.',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '={{$credentials.baseUrl}}/api/muse/oauth/authorize',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: '={{$credentials.baseUrl}}/api/muse/oauth/token',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'n8n.read n8n.write',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];

	// GET {baseUrl}/api/integrations/n8n/v1/auth/test — same endpoint as the
	// API-key credential test; the OAuth2 access token is sent by n8n.
	test: ICredentialTestRequest = {
		request: {
			baseURL: `={{$credentials.baseUrl}}${NXT_API_BASE_PATH}`,
			url: '/auth/test',
			method: 'GET',
		},
	};
}

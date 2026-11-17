// NxtSend API-key credential.
//
// Get an API key in the NxtSend dashboard: Settings → Integrations → n8n.
// Keys look like `nxt_live_…` and resolve to exactly one workspace. The key
// is stored in n8n's encrypted credential storage; it is never logged.
import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

import { DEFAULT_BASE_URL, NXT_API_BASE_PATH } from '../nodes/shared/constants';

export class NxtSendApi implements ICredentialType {
	name = 'nxtSendApi';

	displayName = 'NxtSend API';

	icon: Icon = { light: 'file:nxtsend.svg', dark: 'file:nxtsend.svg' };

	documentationUrl = 'https://github.com/zakariaalammithu/NxtSend/tree/main/integrations/n8n-nodes-nxtsend#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: DEFAULT_BASE_URL,
			placeholder: 'https://nxtsend.com',
			description: 'Base URL of your NxtSend instance. Leave the default unless you self-host.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'nxt_live_…',
			description: 'API key from NxtSend Settings → Integrations → n8n.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// GET {baseUrl}/api/integrations/n8n/v1/auth/test — returns the
	// workspace and user the key belongs to, plus its scopes.
	test: ICredentialTestRequest = {
		request: {
			baseURL: `={{$credentials.baseUrl}}${NXT_API_BASE_PATH}`,
			url: '/auth/test',
			method: 'GET',
		},
	};
}

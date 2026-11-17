// Tests for both credential types: fields, defaults, OAuth2 base, and the
// credential test request (GET /auth/test). No live calls.
import { NxtSendApi } from '../credentials/NxtSendApi.credentials';
import { NxtSendOAuth2Api } from '../credentials/NxtSendOAuth2Api.credentials';

describe('NxtSendApi credential (API key)', () => {
	const cred = new NxtSendApi();

	it('has the right names', () => {
		expect(cred.name).toBe('nxtSendApi');
		expect(cred.displayName).toBe('NxtSend API');
	});

	it('has a baseUrl defaulting to https://nxtsend.com and a password apiKey', () => {
		const baseUrl = cred.properties.find((p) => p.name === 'baseUrl');
		expect(baseUrl?.default).toBe('https://nxtsend.com');
		const apiKey = cred.properties.find((p) => p.name === 'apiKey');
		expect(apiKey?.typeOptions?.password).toBe(true);
		expect(apiKey?.default).toBe('');
	});

	it('authenticates with a Bearer header from the stored key', () => {
		const authenticate = cred.authenticate as {
			properties: { headers: Record<string, string> };
		};
		expect(authenticate.properties.headers.Authorization).toBe('=Bearer {{$credentials.apiKey}}');
	});

	it('tests credentials with GET /auth/test under the n8n API base path', () => {
		expect(cred.test?.request.method).toBe('GET');
		expect(cred.test?.request.url).toBe('/auth/test');
		expect(cred.test?.request.baseURL).toContain('/api/integrations/n8n/v1');
	});

	it('has an icon', () => {
		expect(cred.icon).toBeDefined();
	});
});

describe('NxtSendOAuth2Api credential (OAuth2)', () => {
	const cred = new NxtSendOAuth2Api();

	it('has the right names and extends the built-in OAuth2 credential', () => {
		expect(cred.name).toBe('nxtSendOAuth2Api');
		expect(cred.displayName).toBe('NxtSend OAuth2 API');
		// The built-in OAuth2 credential is named `oAuth2Api` (see
		// n8n-workflow's `extends:oAuth2Api`); NOT `oAuth2`.
		expect(cred.extends).toEqual(['oAuth2Api']);
	});

	it('derives authorize/token URLs from baseUrl and requests the n8n scopes', () => {
		const byName = Object.fromEntries(cred.properties.map((p) => [p.name, p]));
		expect(byName.baseUrl?.default).toBe('https://nxtsend.com');
		expect(String(byName.authUrl?.default)).toBe(
			'={{$credentials.baseUrl}}/api/muse/oauth/authorize',
		);
		expect(String(byName.accessTokenUrl?.default)).toBe(
			'={{$credentials.baseUrl}}/api/muse/oauth/token',
		);
		expect(byName.scope?.default).toBe('n8n.read n8n.write');
	});

	it('tests credentials with the same GET /auth/test endpoint', () => {
		expect(cred.test?.request.method).toBe('GET');
		expect(cred.test?.request.url).toBe('/auth/test');
		expect(cred.test?.request.baseURL).toContain('/api/integrations/n8n/v1');
	});

	it('has an icon', () => {
		expect(cred.icon).toBeDefined();
	});
});

'use strict';

require('./setup');

const { nock } = require('./setup');
const zapier = require('zapier-platform-core');
const App = require('../index');

const appTester = zapier.createAppTester(App);
const BASE = 'https://nxtsend.com';

describe('authentication', () => {
  test('is OAuth2 authorization-code with the shared NxtSend endpoints', () => {
    const auth = App.authentication;
    expect(auth.type).toBe('oauth2');
    expect(auth.oauth2Config.authorizeUrl.url).toBe(
      `${BASE}/api/muse/oauth/authorize`
    );
    expect(auth.oauth2Config.getAccessToken.url).toBe(
      `${BASE}/api/muse/oauth/token`
    );
    expect(auth.oauth2Config.refreshAccessToken.url).toBe(
      `${BASE}/api/muse/oauth/token`
    );
    expect(auth.oauth2Config.autoRefresh).toBe(true);
  });

  test('authorize URL uses env client id/secret placeholders, never values', () => {
    const params = App.authentication.oauth2Config.authorizeUrl.params;
    expect(params.client_id).toBe('{{process.env.CLIENT_ID}}');
    expect(params.redirect_uri).toBe('{{bundle.inputData.redirect_uri}}');
    expect(params.state).toBe('{{bundle.inputData.state}}');
    expect(params.response_type).toBe('code');
    expect(params.scope).toBe('zapier.read zapier.write');
    // The only "secret" in the auth definition is the
    // {{process.env.CLIENT_SECRET}} placeholder (key name +
    // placeholder) — no secret value anywhere.
    const serialized = JSON.stringify(App.authentication);
    const stripped = serialized
      .replace(/"client_secret":/g, '')
      .replace(/\{\{process\.env\.CLIENT_SECRET\}\}/g, '');
    expect(stripped).not.toMatch(/secret/i);
    expect(stripped).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  test('token requests send the client secret from env, not from the repo', () => {
    const getToken = App.authentication.oauth2Config.getAccessToken;
    expect(getToken.body.client_secret).toBe('{{process.env.CLIENT_SECRET}}');
    expect(getToken.body.grant_type).toBe('authorization_code');
    const refresh = App.authentication.oauth2Config.refreshAccessToken;
    expect(refresh.body.grant_type).toBe('refresh_token');
    expect(refresh.body.refresh_token).toBe('{{bundle.authData.refresh_token}}');
  });

  test('PKCE is deliberately not enabled (confidential client)', () => {
    // The installed core schema documents `enablePkce`, but the
    // NxtSend server exempts confidential clients (client_secret)
    // from PKCE — see authentication.js. Must stay unset.
    expect(App.authentication.oauth2Config.enablePkce).toBeUndefined();
  });

  test('connection label is workspace name + user email, never a secret', () => {
    expect(App.authentication.connectionLabel).toBe(
      '{{json.workspace.name}} ({{json.user.email}})'
    );
  });

  test('auth test succeeds against the mocked auth-test endpoint', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/auth/test')
      .reply(200, {
        user: { id: 'user_1', email: 'owner@example.com' },
        workspace: { id: 'ws_1', name: 'Example Workspace' },
        scopes: ['zapier.read', 'zapier.write'],
      });
    const bundle = { authData: { access_token: 'test-token' } };
    const result = await appTester(App.authentication.test, bundle);
    expect(result.user.email).toBe('owner@example.com');
    expect(result.workspace.name).toBe('Example Workspace');
  });

  test('auth test fails on a 401 (bad/expired token, refresh unavailable)', async () => {
    nock(BASE).get('/api/integrations/zapier/v1/auth/test').reply(401, {
      error: 'invalid_token',
    });
    // The refresh attempt is also mocked to fail, so the 401
    // surfaces instead of hanging on a live token call.
    nock(BASE).post('/api/muse/oauth/token').reply(400, { error: 'invalid_grant' });
    const bundle = {
      authData: { access_token: 'stale-token', refresh_token: 'stale-refresh' },
    };
    await expect(appTester(App.authentication.test, bundle)).rejects.toThrow();
  });
});

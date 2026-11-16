'use strict';

/**
 * OAuth2 authentication for the NxtSend Zapier app.
 *
 * Authorization-code flow ONLY, against NxtSend's shared OAuth
 * server (`/api/muse/oauth/*` — one OAuth server for Muse,
 * ChatGPT, Claude and Zapier; see
 * src/lib/muse-connector/oauth/). The Zapier OAuth client is
 * PRE-REGISTERED out of band via Dynamic Client Registration and
 * its id/secret live in the Zapier developer dashboard as the app
 * environment variables `CLIENT_ID` / `CLIENT_SECRET` — they are
 * NEVER hardcoded here and never appear in this repo.
 *
 * Scopes: `zapier.read zapier.write` (there is NO `zapier.send` —
 * see src/lib/muse-connector/oauth/scopes.ts). The `scope` param
 * is sent explicitly: the server defaults an omitted scope to the
 * platform's read-only scope, and writes would then fail.
 *
 * PKCE: deliberately NOT enabled. The installed
 * zapier-platform-core schema documents an `enablePkce` flag, but
 * the NxtSend server exempts confidential clients (a client with a
 * stored `client_secret_hash`) from its PKCE requirement — see
 * src/lib/muse-connector/oauth/authorize.ts ("Zapier's standard
 * OAuth2 client sends no PKCE") — and the Zapier client IS
 * confidential: it authenticates the code exchange with its
 * client_secret. Enabling PKCE here would add a second mechanism
 * the server does not need from this client.
 *
 * Refresh tokens: Zapier may re-use a rotated refresh token, so
 * the server keeps a grace path for the previous token (see
 * src/lib/muse-connector/oauth/tokens.ts). `refreshAccessToken`
 * returns BOTH the new access_token AND the new refresh_token
 * whenever the server returns one, so Zapier always stores the
 * freshest pair.
 *
 * Redirect URI: never hardcoded — Zapier supplies
 * `{{bundle.inputData.redirect_uri}}` (the exact
 * `https://zapier.com/dashboard/auth/oauth/return/AppXXXXXCLIAPI/`
 * URL shown for this app after `zapier-platform register`). That
 * URL must be registered on the OAuth client, or authorization
 * fails with a redirect_uri mismatch.
 */

const { apiUrl, baseUrl } = require('./lib/api');

const ZAPIER_SCOPES = 'zapier.read zapier.write';

const authentication = {
  type: 'oauth2',
  test: {
    url: apiUrl('/auth/test'),
    method: 'GET',
  },
  oauth2Config: {
    authorizeUrl: {
      url: `${baseUrl()}/api/muse/oauth/authorize`,
      params: {
        client_id: '{{process.env.CLIENT_ID}}',
        state: '{{bundle.inputData.state}}',
        redirect_uri: '{{bundle.inputData.redirect_uri}}',
        response_type: 'code',
        scope: ZAPIER_SCOPES,
      },
    },
    getAccessToken: {
      url: `${baseUrl()}/api/muse/oauth/token`,
      method: 'POST',
      body: {
        code: '{{bundle.inputData.code}}',
        client_id: '{{process.env.CLIENT_ID}}',
        client_secret: '{{process.env.CLIENT_SECRET}}',
        redirect_uri: '{{bundle.inputData.redirect_uri}}',
        grant_type: 'authorization_code',
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    refreshAccessToken: {
      url: `${baseUrl()}/api/muse/oauth/token`,
      method: 'POST',
      body: {
        refresh_token: '{{bundle.authData.refresh_token}}',
        client_id: '{{process.env.CLIENT_ID}}',
        client_secret: '{{process.env.CLIENT_SECRET}}',
        grant_type: 'refresh_token',
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    autoRefresh: true,
  },
  // Shown in the Zapier UI as the connected account: workspace name
  // + user email, from the /v1/auth/test response. Never secrets.
  connectionLabel: '{{json.workspace.name}} ({{json.user.email}})',
};

module.exports = authentication;

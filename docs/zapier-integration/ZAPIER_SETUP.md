# Zapier Integration — Zapier Developer Dashboard Setup (Owner Steps)

These steps need the owner's Zapier developer account. **Do NOT run
`register` / `push` / `promote`** without them — they need a Zapier
developer account + deploy key. Nothing here has been run from this
environment.

## Prerequisites

- Migrations 025–027 applied to live Supabase (see
  [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)).
- The app deployed (e.g. `https://nxtsend.com`) with
  `TOKEN_ENCRYPTION_KEY` set.

## 1. Register the OAuth client (one-time DCR)

Copy the **OAuth Redirect URL** from the Zapier developer dashboard
first (it looks like
`https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/` —
the App ID is assigned at registration and **may change after
publish/beta**, in which case re-register with the new URL), then run
the exact curl in [ZAPIER_SERVER.md](ZAPIER_SERVER.md) (DCR against
`POST https://<your-domain>/api/muse/oauth/register` with
`client_name: "Zapier"`, the redirect URI, and
`token_endpoint_auth_method: "client_secret_post"`).

The response contains `client_id` and `client_secret` (**shown once
— store it in the Zapier developer dashboard immediately**).

## 2. Create the app and register it with the CLI

In the Zapier developer dashboard, create the app and run:

```bash
cd integrations/zapier
npx zapier-platform register "NxtSend"   # writes .zapierapprc — never commit it
```

`.zapierapprc` is git-ignored (see `.gitignore`).

## 3. Set the app environment variables (in the dashboard, never in this repo)

| Variable | Value |
|---|---|
| `CLIENT_ID` / `CLIENT_SECRET` | From step 1. The redirect URI is the exact `https://zapier.com/dashboard/auth/oauth/return/AppXXXXXCLIAPI/` URL Zapier shows for this app — it must match the client's registered redirect URIs or authorization fails (the App ID may change after publish/beta — re-register then). |
| `ZAPIER_APP_BASE_URL` | `https://nxtsend.com` (or a staging origin for testing). |

OAuth settings in the app:

- Authorization URL: `https://<your-domain>/api/muse/oauth/authorize`
- Token URL: `https://<your-domain>/api/muse/oauth/token`
- Scopes: `zapier.read zapier.write` (or `zapier.read` for read-only Zaps)
- Resource (RFC 8707): `https://<your-domain>/api/integrations/zapier`
- No PKCE (the Zapier client is confidential — see
  `integrations/zapier/authentication.js`).

## 4. Validate, test, build (local, no account needed)

```bash
cd integrations/zapier
npm install
npx zapier-platform validate   # must pass; local only
npx zapier-platform test       # jest + appTester + Nock mocks; no live calls
npx zapier-platform build --skip-dep-install   # builds a pushable zip locally
```

`build` without `--skip-dep-install` re-installs dependencies into
a temp dir and can hit `EMFILE` on machines with a low open-file
limit (4096 in this sandbox) — `--skip-dep-install` avoids it.

## 5. Push a version

```bash
npx zapier-platform push
```

## 6. Connect and test live (PENDING)

- Add an NxtSend account in the Zapier editor (sign in on NxtSend's
  consent screen, choose scopes — `zapier.read` only unless the Zap
  needs to change things).
- Run one live Zap per trigger/action/search; check the grant
  appears on the Zapier Integration Center page and the admin Zapier
  panel.
- Test one instant trigger end-to-end against a real
  `hooks.zapier.com` URL and confirm the delivery lands.
- Confirm a failed delivery retries on the next 06:00 cron tick.

## 7. Publish (NOT claimed)

See [PUBLISHING.md](PUBLISHING.md): free review (~1 week), then
90-day Beta, then Public. Zapier requires a non-expiring test
account for integration-testing@zapier.com and live Zaps with
successful runs per trigger/action/search. **Publication is NOT
claimed until that is done.**

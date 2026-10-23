/**
 * Integration Center registry — one descriptor per integration.
 *
 * Pure data (no env access, no secrets): safe to serialise to the
 * browser through GET /api/integrations/status. Statuses are computed
 * separately in ./status.ts from the existing env-derived state
 * modules; nothing here claims a connection.
 *
 * The env var lists MUST match .env.example exactly — a unit test
 * (registry consistency test) enforces that every name listed here
 * exists in .env.example.
 */

import type { IntegrationDescriptor } from "./types";

const VERCEL_HINT =
  "Set it in Vercel → Project → Settings → Environment Variables (or .env.local for local development), then redeploy/restart.";

export const INTEGRATION_REGISTRY: IntegrationDescriptor[] = [
  {
    id: "supabase",
    name: "Supabase (Database & Auth)",
    category: "Core infrastructure",
    tagline: "PostgreSQL database, authentication and Row Level Security for every workspace.",
    description:
      "Supabase is NxtSend's data and auth backbone: user accounts, workspaces, leads, campaigns, messages, subscriptions and audit logs all live in Postgres with RLS enforcing tenant isolation. Without it the app runs in Demo Mode on labelled sample data.",
    docsUrl: "https://supabase.com/docs",
    kind: "infrastructure",
    envVars: [
      { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, visibility: "public", purpose: "Project URL (Supabase → Settings → API). " + VERCEL_HINT },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, visibility: "public", purpose: "Anon/public key — safe in the browser because RLS protects every table. " + VERCEL_HINT },
      { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, visibility: "server-only", purpose: "Service-role key for admin APIs, webhooks and jobs. Bypasses RLS — server only, never expose it. " + VERCEL_HINT },
    ],
    capabilities: [
      "Email/password auth with email verification and password reset",
      "Workspace-scoped data with Row Level Security (migrations 001–006)",
      "Server-side admin operations via the service role",
    ],
    setupSteps: [
      "Create a project at supabase.com and wait for it to finish provisioning.",
      "Run the SQL migrations in order (001 → 006) in the Supabase SQL Editor — see SETUP.md §2.",
      "Set the three environment variables and redeploy.",
      "Configure Auth → URL Configuration with your app URL and redirect URLs (SETUP.md §3).",
      "Use Test Connection here — it calls the project's Auth health endpoint.",
    ],
    troubleshooting: [
      "Status stays Demo Mode: the URL or anon key is still the .env.example placeholder — placeholders are treated as not configured.",
      "Health check fails with 404: the URL is not a Supabase project URL (it must look like https://<ref>.supabase.co).",
      "Rows visible across workspaces would mean RLS is off — do not disable RLS; run the migrations instead.",
    ],
    verifySupported: true,
  },
  {
    id: "resend",
    name: "Email / Resend",
    category: "Outreach & email",
    tagline: "Transactional and outreach email sending, delivery events and inbound replies.",
    description:
      "Resend is NxtSend's email provider: campaign and inbox-reply sends go through the Resend adapter (suppression list is checked before every send and fails closed), delivery/bounce events return via a signature-verified webhook, and replies are ingested when a Resend receiving domain is configured.",
    docsUrl: "https://resend.com/docs",
    kind: "adapter",
    envVars: [
      { name: "RESEND_API_KEY", required: true, visibility: "server-only", purpose: "API key from resend.com/api-keys, with sending permission. " + VERCEL_HINT },
      { name: "EMAIL_FROM", required: true, visibility: "server-only", purpose: "Verified sender identity, e.g. NxtSend <hello@yourdomain.com> — the domain must be verified in Resend. " + VERCEL_HINT },
      { name: "RESEND_WEBHOOK_SECRET", required: false, visibility: "server-only", purpose: "Svix signing secret for the delivery webhook. While unset, /api/webhooks/resend REJECTS events (503) instead of accepting them unverified. " + VERCEL_HINT },
      { name: "EMAIL_REPLY_TO", required: false, visibility: "server-only", purpose: "Reply-To for all outbound email (campaign steps + inbox replies) — an address on your receiving domain, so replies reach the Inbox. While unset, replies go to EMAIL_FROM. " + VERCEL_HINT },
      { name: "UNSUBSCRIBE_SECRET", required: false, visibility: "server-only", purpose: "HMAC secret signing the one-click unsubscribe links in every outbound email. While unset, the key is derived from SUPABASE_SERVICE_ROLE_KEY; while both are unset, sends omit the unsubscribe URL and warn instead of emitting an invalid link. " + VERCEL_HINT },
    ],
    capabilities: [
      "Send email with suppression enforcement before every send",
      "Delivery, bounce and complaint tracking via signed webhooks (bounces auto-suppress)",
      "Inbound reply ingestion (requires a Resend receiving domain — see SETUP.md §6)",
      "One-click unsubscribe (RFC 8058 List-Unsubscribe) + footer link on every outbound email; unsubscribes land on the suppression list",
    ],
    setupSteps: [
      "Create a Resend account and verify your sending domain (SPF/DKIM records).",
      "Create an API key and set RESEND_API_KEY + EMAIL_FROM.",
      "Register the webhook URL below in Resend and set RESEND_WEBHOOK_SECRET.",
      "For inbox replies, additionally configure a Resend receiving domain and subscribe the webhook to email.received (SETUP.md §6).",
      "Use Test Connection — it lists your Resend domains (read-only) to prove the key works.",
    ],
    troubleshooting: [
      "Configuration Required: exactly one of RESEND_API_KEY / EMAIL_FROM is set — both are required.",
      "Verification fails with an API error: the key is invalid, revoked, or restricted to a different operation.",
      "Webhook events rejected (503): RESEND_WEBHOOK_SECRET is unset — the route refuses unverified events by design.",
      "Sends refused with a suppression error: SUPABASE_SERVICE_ROLE_KEY is missing, so the suppression check cannot run and sending fails closed.",
    ],
    webhook: {
      urlPath: "/api/webhooks/resend",
      notes:
        "Register this URL in the Resend dashboard (Webhooks) and subscribe to the delivery event types (email.delivered, email.bounced, email.complained, …) plus email.received if you configured a receiving domain. Signing uses the Svix scheme; the secret goes in RESEND_WEBHOOK_SECRET.",
    },
    verifySupported: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Outreach & email",
    tagline: "Send campaign + inbox email from a real Gmail / Google Workspace mailbox via OAuth.",
    description:
      "Gmail mailboxes connect with Google's OAuth 2.0 authorization-code flow — the mailbox owner consents on Google's own screen; NxtSend never sees or asks for a password or app password. The returned tokens are encrypted at rest (AES-256-GCM, keyed by TOKEN_ENCRYPTION_KEY) in the service-role-only oauth_connections table (migration 014) and are never exposed to the browser. Once connected, a campaign whose selected email account is this mailbox sends through the Gmail API with From = the mailbox address — including the same one-click unsubscribe headers and suppression enforcement as Resend sends. Picking a disconnected mailbox refuses the send honestly; there is no silent fallback to Resend. Access tokens refresh automatically; a failed refresh marks the mailbox 'needs reconnect'.",
    docsUrl: "https://developers.google.com/gmail/api/guides",
    kind: "adapter",
    envVars: [
      { name: "GOOGLE_CLIENT_ID", required: true, visibility: "server-only", purpose: "OAuth client ID from the Google Cloud Console (APIs & Services → Credentials → OAuth 2.0 Client ID, type Web application). " + VERCEL_HINT },
      { name: "GOOGLE_CLIENT_SECRET", required: true, visibility: "server-only", purpose: "The OAuth client's secret (shown once by Google — store it here, server-side only). " + VERCEL_HINT },
      { name: "TOKEN_ENCRYPTION_KEY", required: true, visibility: "server-only", purpose: "AES-256 key encrypting the stored OAuth tokens (base64 of 32 bytes; generate: openssl rand -base64 32). Shared with the Outlook entry. While unset/malformed, mailbox connect refuses before any redirect. " + VERCEL_HINT },
    ],
    capabilities: [
      "OAuth connect / disconnect for Gmail + Google Workspace mailboxes (consent on Google's screen — no passwords, ever)",
      "Campaign email steps + inbox replies sent From the connected mailbox (Gmail API), chosen per campaign via its email account",
      "One-click unsubscribe (RFC 8058) + suppression enforcement before every send — identical to Resend sends",
      "Automatic access-token refresh; failed refresh → recorded 'needs reconnect' state, never a silent fallback",
    ],
    setupSteps: [
      "In the Google Cloud Console, create (or pick) a project and enable the Gmail API (APIs & Services → Library → Gmail API).",
      "Configure the OAuth consent screen (APIs & Services → OAuth consent screen): External, app name NxtSend, your support email; add the scopes https://www.googleapis.com/auth/gmail.send and https://www.googleapis.com/auth/gmail.readonly (plus openid/email/profile, which the flow requests). While the app is in Google's 'Testing' mode only listed test users can connect — submit for verification before connecting production mailboxes.",
      "Create credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application. Under 'Authorized redirect URIs' add the callback URL shown in the Connected mailbox panel below (in production: https://<your-app-domain>/api/oauth/google/callback).",
      "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY (openssl rand -base64 32) in Vercel, then redeploy.",
      "Use the Connect button in the Connected mailbox panel below and complete Google's consent. The connection exists only after Google returns and the mailbox profile is fetched — the panel then shows the connected address.",
      "In a campaign, select this mailbox as the email account (Connected Accounts / campaign wizard Step 1) — its steps send From the mailbox; inbox replies route through it too.",
    ],
    troubleshooting: [
      "Connect returns 'not_configured': one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / TOKEN_ENCRYPTION_KEY is missing or still a placeholder, or NEXT_PUBLIC_APP_URL is not the public origin in production — the panel lists the missing names.",
      "Google shows 'redirect_uri_mismatch': the callback URL registered in the Google Cloud Console does not exactly match the one in the panel (scheme, domain, path — no trailing slash).",
      "Google shows 'access_blocked' / unverified app: the consent screen is in Testing mode and your Google account is not a listed test user, or the app has not passed verification for the Gmail scopes.",
      "Mailbox shows 'needs reconnect': the access token expired and the refresh failed (grant revoked, password/security change, or the app was deauthorized) — reconnect from the panel; sends from this mailbox refuse until then.",
      "Disconnect: use the Disconnect button in the panel — it deletes the stored tokens and revokes the grant at Google (best effort, reported in the response).",
    ],
    verifySupported: true,
  },
  {
    id: "microsoft",
    name: "Outlook (Microsoft 365)",
    category: "Outreach & email",
    tagline: "Send campaign + inbox email from a real Outlook / Microsoft 365 mailbox via OAuth.",
    description:
      "Outlook and Microsoft 365 mailboxes connect with the Microsoft identity platform's OAuth 2.0 authorization-code flow (tenant 'common' — work/school and personal accounts) — the mailbox owner consents on Microsoft's own screen; NxtSend never sees or asks for a password. Tokens are encrypted at rest (AES-256-GCM, keyed by TOKEN_ENCRYPTION_KEY) in the service-role-only oauth_connections table (migration 014) and never exposed to the browser. Once connected, a campaign whose selected email account is this mailbox sends through Microsoft Graph with From = the mailbox address — including the same one-click unsubscribe headers and suppression enforcement as Resend sends. Graph note: Graph's simple sendMail call returns no message ID, so sends use Graph's create-message + send flow and record the provider-assigned message ID. Picking a disconnected mailbox refuses the send honestly; there is no silent fallback to Resend.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/user-sendmail",
    kind: "adapter",
    envVars: [
      { name: "MICROSOFT_CLIENT_ID", required: true, visibility: "server-only", purpose: "Application (client) ID from the Azure app registration (Azure Portal → App registrations). " + VERCEL_HINT },
      { name: "MICROSOFT_CLIENT_SECRET", required: true, visibility: "server-only", purpose: "Client secret VALUE from the app registration (Certificates & secrets) — copy it at creation; Azure shows it once. " + VERCEL_HINT },
      { name: "TOKEN_ENCRYPTION_KEY", required: true, visibility: "server-only", purpose: "AES-256 key encrypting the stored OAuth tokens (base64 of 32 bytes; generate: openssl rand -base64 32). Shared with the Gmail entry. While unset/malformed, mailbox connect refuses before any redirect. " + VERCEL_HINT },
    ],
    capabilities: [
      "OAuth connect / disconnect for Outlook.com + Microsoft 365 mailboxes (consent on Microsoft's screen — no passwords, ever)",
      "Campaign email steps + inbox replies sent From the connected mailbox (Microsoft Graph), chosen per campaign via its email account",
      "One-click unsubscribe (RFC 8058) + suppression enforcement before every send — identical to Resend sends",
      "Automatic access-token refresh (refresh tokens rotate and are re-stored encrypted); failed refresh → recorded 'needs reconnect' state",
    ],
    setupSteps: [
      "In the Azure Portal → App registrations → New registration: name it NxtSend, and choose 'Accounts in any organizational directory and personal Microsoft accounts' (the flow uses tenant 'common').",
      "Under the registration's Authentication → Add a platform → Web, add the redirect URI shown in the Connected mailbox panel below (in production: https://<your-app-domain>/api/oauth/microsoft/callback).",
      "Under API permissions → Add a permission → Microsoft Graph → Delegated permissions, add: User.Read, Mail.Send, Mail.Read and offline_access (offline_access is what makes Microsoft issue a refresh token). Grant admin consent if your tenant requires it.",
      "Under Certificates & secrets → New client secret, create a secret and copy its VALUE immediately (shown once).",
      "Set MICROSOFT_CLIENT_ID (the Application (client) ID) + MICROSOFT_CLIENT_SECRET (the value) and TOKEN_ENCRYPTION_KEY (openssl rand -base64 32) in Vercel, then redeploy.",
      "Use the Connect button in the Connected mailbox panel below and complete Microsoft's consent. The connection exists only after Microsoft returns and the Graph profile is fetched — the panel then shows the connected address.",
    ],
    troubleshooting: [
      "Connect returns 'not_configured': one of MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / TOKEN_ENCRYPTION_KEY is missing or still a placeholder, or NEXT_PUBLIC_APP_URL is not the public origin in production — the panel lists the missing names.",
      "Microsoft error AADSTS50011 (redirect URI mismatch): the URI registered in the app registration does not exactly match the one in the panel.",
      "Microsoft error AADSTS65001 (consent required): a tenant admin must grant consent for the Graph permissions, or the user must consent first in an admin-approved flow.",
      "Mailbox shows 'needs reconnect': the refresh token expired or was revoked (Microsoft refresh tokens rotate; a security event can invalidate them) — reconnect from the panel; sends from this mailbox refuse until then.",
      "Disconnect: use the Disconnect button in the panel — it deletes the stored tokens and marks the account disconnected. Microsoft provides no revocation endpoint for this flow, so also remove the app's consent in the Microsoft account (microsoft.com → Privacy → Apps and services) if you want the grant gone there too.",
    ],
    verifySupported: true,
  },
  {
    id: "stripe",
    name: "Stripe (Billing)",
    category: "Billing",
    tagline: "Subscriptions, checkout, customer portal and payment webhooks.",
    description:
      "Stripe powers plan subscriptions. Checkout and the customer portal are created server-side; plan changes happen ONLY in the signature-verified, idempotent webhook — never in the checkout route — so a payment is never reported from configuration alone.",
    docsUrl: "https://docs.stripe.com",
    kind: "adapter",
    envVars: [
      { name: "STRIPE_SECRET_KEY", required: true, visibility: "server-only", purpose: "Secret key from dashboard.stripe.com/apikeys. " + VERCEL_HINT },
      { name: "STRIPE_WEBHOOK_SECRET", required: true, visibility: "server-only", purpose: "Signing secret for /api/webhooks/stripe. While unset, the webhook route rejects events (503). " + VERCEL_HINT },
      { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", required: false, visibility: "public", purpose: "Publishable key (public by design; reserved for future client-side Stripe.js use)." },
      { name: "STRIPE_PRICE_ID_STARTER", required: false, visibility: "server-only", purpose: "Price ID for the Starter plan, monthly interval. Checkout refuses with Configuration Required for any plan whose ID is missing." },
      { name: "STRIPE_PRICE_ID_STARTER_ANNUAL", required: false, visibility: "server-only", purpose: "Price ID for the Starter plan, annual interval." },
      { name: "STRIPE_PRICE_ID_GROWTH", required: false, visibility: "server-only", purpose: "Price ID for the Growth plan, monthly interval." },
      { name: "STRIPE_PRICE_ID_GROWTH_ANNUAL", required: false, visibility: "server-only", purpose: "Price ID for the Growth plan, annual interval." },
      { name: "STRIPE_PRICE_ID_AGENCY", required: false, visibility: "server-only", purpose: "Price ID for the Agency plan, monthly interval." },
      { name: "STRIPE_PRICE_ID_AGENCY_ANNUAL", required: false, visibility: "server-only", purpose: "Price ID for the Agency plan, annual interval." },
    ],
    capabilities: [
      "Hosted Checkout sessions and Customer Portal (server-created)",
      "Signature-verified, idempotent subscription webhooks (billing_events)",
      "Plan limits enforced from the in-app plan catalog",
    ],
    setupSteps: [
      "Create the plan Products + Prices in the Stripe dashboard (amounts in SETUP.md §7) and copy the Price IDs into the env vars.",
      "Set STRIPE_SECRET_KEY and the publishable key.",
      "Register the webhook URL below for checkout.session.completed, customer.subscription.* and invoice.payment_failed; set STRIPE_WEBHOOK_SECRET.",
      "Use Test Connection — it retrieves the Stripe account (read-only) to prove the key works.",
    ],
    troubleshooting: [
      "Configuration Required: only one of STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET is set.",
      "Checkout refuses for one plan only: that plan's Price ID env var is missing.",
      "Webhook 503s: STRIPE_WEBHOOK_SECRET is unset — unverified events are rejected by design.",
      "Note: the in-app plan catalog and the marketing site's per-seat pricing are not yet reconciled (documented product decision, SETUP.md §7) — Stripe Prices should match the catalog you intend to sell.",
    ],
    webhook: {
      urlPath: "/api/webhooks/stripe",
      notes:
        "Register this URL in Stripe → Developers → Webhooks with events: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.payment_failed. Events are deduplicated by event ID before any effect is applied.",
    },
    verifySupported: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI providers",
    tagline: "AI drafting for outreach messages (human review always required).",
    description:
      "OpenAI powers the 'Draft with AI' feature in the campaign sequence editor via the documented Chat Completions API. Drafts land in the editor for mandatory human review — nothing is ever auto-sent. This uses the OpenAI API (pay-as-you-go API key), not a ChatGPT consumer subscription.",
    docsUrl: "https://platform.openai.com/docs",
    kind: "adapter",
    envVars: [
      { name: "OPENAI_API_KEY", required: true, visibility: "server-only", purpose: "API key from platform.openai.com/api-keys. " + VERCEL_HINT },
      { name: "OPENAI_MODEL", required: false, visibility: "server-only", purpose: "Optional model override (default gpt-4o-mini)." },
    ],
    capabilities: [
      "Outreach message drafting with personalization placeholders preserved",
      "Provider selection: OpenAI is preferred when several AI keys exist",
    ],
    setupSteps: [
      "Create an API key at platform.openai.com and set OPENAI_API_KEY.",
      "Optionally set OPENAI_MODEL to override the default model.",
      "Use Test Connection — it lists models (read-only) to prove the key works.",
    ],
    troubleshooting: [
      "Verification returns 401: the key is invalid or the project has no API access/billing.",
      "Drafts show 'AI not configured': no AI provider key is set on the server.",
    ],
    verifySupported: true,
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    category: "AI providers",
    tagline: "AI drafting via Anthropic's Claude models.",
    description:
      "Anthropic is the second AI drafting provider, called through the documented Messages API with server-side credentials. Used when no OpenAI key is configured, or selected by the AI state module's deterministic provider order (OpenAI → Anthropic → Meta Model API).",
    docsUrl: "https://docs.anthropic.com",
    kind: "adapter",
    envVars: [
      { name: "ANTHROPIC_API_KEY", required: true, visibility: "server-only", purpose: "API key from console.anthropic.com/settings/keys. " + VERCEL_HINT },
      { name: "ANTHROPIC_MODEL", required: false, visibility: "server-only", purpose: "Optional model override (default claude-sonnet-4-5)." },
    ],
    capabilities: ["Outreach message drafting (same human-review flow as OpenAI)"],
    setupSteps: [
      "Create an API key in the Anthropic console and set ANTHROPIC_API_KEY.",
      "Optionally set ANTHROPIC_MODEL.",
      "Use Test Connection — it lists models (read-only) to prove the key works.",
    ],
    troubleshooting: [
      "Verification returns 401: invalid key. 403/404 can mean the key's workspace lacks model access.",
      "If both OpenAI and Anthropic keys exist, OpenAI drafts are used first.",
    ],
    verifySupported: true,
  },
  {
    id: "meta-model",
    name: "Meta Model API (Muse Spark)",
    category: "AI providers",
    tagline: "Meta's Muse Spark models via the OpenAI-compatible Meta Model API.",
    description:
      "The Meta Model API (api.meta.ai/v1, public preview) exposes Meta's Muse Spark models through an OpenAI-compatible chat-completions shape with a Bearer MODEL_API_KEY. NxtSend can use it as a third AI drafting provider. NOTE: endpoint details are documented via secondary sources quoting Meta's developer documentation — Meta's own developer portal could not be fetched directly during the 2026-10-19 research, so treat the verification result below as the first primary confirmation for your key.",
    docsUrl: "https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/",
    kind: "adapter",
    envVars: [
      { name: "MODEL_API_KEY", required: true, visibility: "server-only", purpose: "Meta Model API key (Bearer token) from Meta's developer console. " + VERCEL_HINT },
      { name: "META_MODEL", required: false, visibility: "server-only", purpose: "Optional model override (default muse-spark-1.3)." },
    ],
    capabilities: [
      "Outreach message drafting via Muse Spark (OpenAI-compatible chat completions)",
      "Selected automatically when it is the only AI key configured",
    ],
    setupSteps: [
      "Create a Meta developer account and a Model API key (public preview — see the Meta AI blog link).",
      "Set MODEL_API_KEY (and optionally META_MODEL).",
      "Use Test Connection — it lists models at api.meta.ai/v1 (read-only).",
    ],
    troubleshooting: [
      "Verification failure may mean the key is wrong — or that the secondary-sourced endpoint details have changed since the research; check Meta's developer documentation before assuming the key is at fault.",
      "This is Meta's MODEL API (inference). It is not an API for Meta's Muse agent product — see the Muse.ai entry.",
    ],
    verifySupported: true,
  },
  {
    id: "muse-ai",
    name: "Muse.ai (Meta Muse)",
    category: "AI providers",
    tagline: "Meta's Muse personal AI agent — integration runs in the opposite direction.",
    description:
      "Research verdict (2026-10-19, sourced): muse.ai today is Meta Platforms' Muse — a consumer personal AI agent. There is NO public API for driving a user's Muse agent, no connector webhooks and no connector SDK. The official integration path is the Muse Connector Platform, and it runs in the opposite direction: NxtSend exposes its own API or hosted MCP server, submits it at muse.ai/platform, and passes Meta's functional/security/legal review plus end-to-end testing to appear in Muse's connector directory. This page carries the readiness pack: the pre-classified tool manifest and the submission checklist.",
    docsUrl: "https://muse.ai/platform/docs",
    kind: "unsupported",
    envVars: [],
    capabilities: [
      "No callable API exists today — nothing about this entry can be 'connected' from NxtSend's side",
      "Prepared: pre-classified tool manifest (Read / Write / Sensitive write) and submission readiness checklist (see below)",
      "Immediately available fallback: publish a public API/OpenAPI spec or hosted MCP server so Muse users can add NxtSend as a Custom Connector without directory approval",
    ],
    setupSteps: [
      "Decide the surface to expose: a hosted MCP endpoint or a documented REST API (OpenAPI spec) for NxtSend.",
      "Classify every tool (Read / Write / Sensitive write) — the manifest below is the starting draft; approval covers only approved tools.",
      "Create the submission at muse.ai/platform with a work email: connector name, company, product website, example prompts, 512×512 icon, privacy policy + terms URLs, support contacts.",
      "Complete business verification and the data-processing questionnaire; provide integration credentials (API key or OAuth with PKCE) and a dedicated test account with representative data.",
      "Pass Meta's 3-stage review (risk assessment → tool review → end-to-end QA). No fee, revenue share or review timeline is published; onboarding runs in waves.",
    ],
    troubleshooting: [
      "Status 'Unsupported / No Documented API' is correct and permanent until Meta publishes an agent API — do not let anyone 'fix' it by inventing endpoints.",
      "The legacy muse.ai VIDEO platform (with its own API) rebranded to Skiv (skiv.com) in March 2026 — if the video platform was the intent, evaluate Skiv instead.",
      "Files to update when access is obtained: src/lib/muse-connector/adapter.ts (implement the interface), this registry entry's status source, SETUP.md §14, and .env.example (only if Meta issues credentials).",
    ],
    notImplementedNote:
      "API Access Required: no documented public API exists for the Muse agent itself. The supported path is the Connector Platform submission described here — NxtSend is the API provider in that relationship, Muse is the client.",
    verifySupported: false,
  },
  {
    id: "meta-pixel",
    name: "Meta Pixel",
    category: "Marketing",
    tagline: "Marketing-page conversion tracking (consent-gated).",
    description:
      "The Meta Pixel loader fires PageView and signup conversion events on MARKETING pages only, and only after a visitor grants cookie consent. When no valid Pixel ID is configured the component renders nothing and makes zero network calls. There is no server-side verification API for a Pixel — verification happens in Meta Events Manager.",
    docsUrl: "https://developers.facebook.com/docs/meta-pixel",
    kind: "adapter",
    envVars: [
      { name: "NEXT_PUBLIC_META_PIXEL_ID", required: true, visibility: "public", purpose: "Numeric Pixel ID from Meta Events Manager. A public identifier by design, not a secret. " + VERCEL_HINT },
    ],
    capabilities: [
      "PageView (deduplicated per route) + CompleteRegistration on signup",
      "Consent gate: nothing fires before the visitor accepts (localStorage consent flag)",
      "Dashboard/admin paths are never tracked",
    ],
    setupSteps: [
      "Create a Pixel in Meta Events Manager and copy its numeric ID.",
      "Set NEXT_PUBLIC_META_PIXEL_ID and redeploy.",
      "Verify in Events Manager → Test Events with consent granted in the browser (SETUP.md §8). There is no server-side test — the Test Connection button explains this instead of pretending to verify.",
    ],
    troubleshooting: [
      "No events in Test Events: consent was not granted in that browser, or the ID is a placeholder/non-numeric value (treated as not configured).",
      "Events on /dashboard would be a bug — tracking is deliberately excluded there.",
    ],
    verifySupported: false,
  },
  {
    id: "webhooks",
    name: "Outbound Webhooks (n8n / Zapier)",
    category: "Automation",
    tagline: "Signed HTTP events to your automation endpoint on lead and campaign changes.",
    description:
      "NxtSend emits HMAC-signed events (lead.created, campaign.created, campaign.status_changed) to one endpoint per workspace — typically an n8n Webhook node or a Zapier Catch Hook. Deliveries are logged and retried by the jobs worker. This is a webhook integration, NOT a native Zapier app (none exists or is claimed). Configure the subscription in the Webhooks section below; Test Connection dispatches a signed nxtsend.test event through the same delivery pipeline.",
    docsUrl: null,
    kind: "adapter",
    envVars: [],
    capabilities: [
      "HMAC-SHA256 signed payloads (X-NxtSend-Signature) with a secret shown exactly once",
      "Delivery log with retry (5 min → 30 min, max 3 attempts) via the jobs worker",
      "Works with n8n, Zapier Catch Hooks, or any HTTPS receiver",
    ],
    setupSteps: [
      "Create a Webhook node in n8n (or a Catch Hook trigger in Zapier) and copy its URL.",
      "Save the URL + event selection in the Outbound Webhooks section below; store the one-time signing secret in your receiver.",
      "In n8n, verify X-NxtSend-Signature in a Code node (Zapier catch hooks cannot verify signatures — treat the URL itself as a secret there).",
      "Use Test Connection to dispatch a signed nxtsend.test event and confirm receipt.",
    ],
    troubleshooting: [
      "Deliveries failing: check the delivery log below; the receiver must answer 2xx within 10 seconds.",
      "Signature mismatch: the secret was regenerated — update the receiver with the current one (it is shown only once at save time).",
      "http:// URLs are accepted only for localhost (local n8n development).",
    ],
    verifySupported: true,
  },
  {
    id: "jobs",
    name: "Background Jobs (Vercel Cron)",
    category: "Automation",
    tagline: "Server-side worker for usage rollups, webhook retries and scheduled follow-ups.",
    description:
      "The jobs worker (/api/jobs/run) processes queued jobs idempotently: usage_rollup (real — monthly per-workspace usage), webhook_retry (real — retries failed deliveries) and follow_up_due (honest stub until a provider-backed sequence executor exists — it logs 'not implemented' and sends nothing). Vercel Cron invokes it daily; the route is gated by CRON_SECRET and refuses to run while the secret is unset.",
    docsUrl: null,
    kind: "infrastructure",
    envVars: [
      { name: "CRON_SECRET", required: true, visibility: "server-only", purpose: "Bearer secret protecting /api/jobs/run. Vercel Cron sends it automatically when the variable exists. Generate: openssl rand -hex 32. " + VERCEL_HINT },
    ],
    capabilities: [
      "Idempotent job processing with execution logs (job_runs)",
      "Usage rollup + webhook retry handlers are real; follow_up_due is an explicit stub",
    ],
    setupSteps: [
      "Set CRON_SECRET in Vercel (the shipped vercel.json registers a daily cron — Hobby-safe).",
      "Smoke-test manually: POST /api/jobs/run with header Authorization: Bearer <CRON_SECRET>.",
      "More frequent schedules need a Vercel Pro plan (SETUP.md §10).",
    ],
    troubleshooting: [
      "Worker returns 503: CRON_SECRET is unset — the worker stays disabled rather than unauthenticated.",
      "401 from the worker: the Bearer value does not match CRON_SECRET.",
    ],
    verifySupported: false,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "Outreach & email",
    tagline: "LinkedIn outreach — requires an authorized provider; currently Demo Mode only.",
    description:
      "LinkedIn's official API does not support outreach automation (connection requests, inbox messaging at scale), and NxtSend does not scrape, automate browsers, or use session cookies. Until an AUTHORIZED LinkedIn provider (a partner API with its own compliance model) is integrated, LinkedIn campaigns and inbox threads run in Demo Mode: data is labelled simulated, LinkedIn steps are recorded SKIPPED by the executor (never simulated as sent), and sending a LinkedIn reply is refused with an explicit 'authorized integration required' state (HTTP 422). The provider adapter seam is src/lib/linkedin (LinkedInProviderAdapter) — today its only implementation refuses honestly. Connected accounts carry provider identity + authorization health (migration 013: provider_account_id, auth_status, last_sync_at, last_error), shown on the Connected Accounts and LinkedIn pages. The variables below are RESERVED for the provider integration — setting them does NOT connect anything: no vendor adapter is implemented yet, and credentials alone never flip the status to Connected.",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/",
    kind: "info",
    envVars: [
      { name: "LINKEDIN_PROVIDER", required: false, visibility: "server-only", purpose: "RESERVED — the name/key of the LinkedIn-approved outreach provider the owner procured (e.g. a LinkedIn partner API). Recorded so the future adapter knows which vendor to load; setting it today changes nothing." },
      { name: "LINKEDIN_PROVIDER_API_KEY", required: false, visibility: "server-only", purpose: "RESERVED — the API key issued by that approved provider. Server-only; never rendered anywhere. Setting it today connects nothing — no vendor adapter is implemented behind src/lib/linkedin yet." },
      { name: "LINKEDIN_CLIENT_ID", required: false, visibility: "server-only", purpose: "Reserved for a future authorized-provider OAuth flow. Setting it today changes nothing." },
      { name: "LINKEDIN_CLIENT_SECRET", required: false, visibility: "server-only", purpose: "Reserved — see LINKEDIN_CLIENT_ID." },
      { name: "LINKEDIN_REDIRECT_URI", required: false, visibility: "server-only", purpose: "Reserved — the callback route it points to does not exist yet." },
    ],
    capabilities: [
      "Demo Mode: simulated accounts, campaigns and inbox threads (clearly labelled)",
      "Refused-by-design: LinkedIn sends until an authorized provider is integrated",
      "Account health + reconnect states (migration 013) shown on Connected Accounts and the LinkedIn page",
    ],
    setupSteps: [
      "Procure an account with an authorized LinkedIn outreach provider (a LinkedIn partner API with its own compliance model) and obtain its API documentation + credentials.",
      "Set LINKEDIN_PROVIDER and LINKEDIN_PROVIDER_API_KEY (Vercel, server-side) so the configuration records which provider was procured.",
      "Implement that provider's adapter behind LinkedInProviderAdapter (src/lib/linkedin) with the same honest-state rules as the other adapters — only then can the status become Connected, after a real verification call succeeds.",
      "Until then there is nothing further to configure — this entry exists so the limitation is explicit, not hidden.",
    ],
    troubleshooting: [
      "Any LinkedIn status other than Demo Mode / Configuration Required would be fabricated — report it as a bug.",
      "Credentials present but still Configuration Required: expected in this build — no vendor adapter is implemented yet; the status message says so.",
      "Inbox LinkedIn threads are readable demo data; the composer is disabled by design.",
    ],
    notImplementedNote:
      "Authorized provider required: no compliant LinkedIn automation API is integrated. Demo Mode is the honest state until one is.",
    verifySupported: false,
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    category: "Data & CRM",
    tagline: "Export leads and replies to Google Sheets — not implemented yet.",
    description:
      "A Google Sheets sync (export converted leads/replies to a spreadsheet) is planned but NOT implemented: there is no adapter, no OAuth flow and no env configuration for it in the codebase today. Lead data can already be exported as CSV from the Leads page, which imports into Sheets manually.",
    docsUrl: "https://developers.google.com/sheets/api",
    kind: "info",
    envVars: [],
    capabilities: ["Not implemented — no adapter exists yet", "Workaround today: CSV export from Leads"],
    setupSteps: [
      "Nothing to configure yet. Implementation would require a Google Cloud project, Sheets API enablement, and an OAuth consent flow — tracked as a future adapter following the patterns in src/lib/email and src/lib/ai.",
    ],
    troubleshooting: ["Any 'connected' claim for Google Sheets would be fabricated — report it as a bug."],
    notImplementedNote: "Not implemented yet: no Google Sheets adapter or OAuth flow exists in the codebase.",
    verifySupported: false,
  },
  {
    id: "crm",
    name: "CRM (HubSpot)",
    category: "Data & CRM",
    tagline: "CRM lead/deal sync — not implemented yet.",
    description:
      "No CRM adapter (HubSpot or otherwise) is implemented: the legacy HubSpot entry is a demo stub whose actions are not wired to any API. NxtSend's built-in CRM today is the Leads section itself (real CSV import/export, lists, tags). A future CRM sync would follow the same adapter + honest-state pattern as Resend/Stripe.",
    docsUrl: "https://developers.hubspot.com",
    kind: "info",
    envVars: [],
    capabilities: ["Not implemented — no CRM adapter exists yet", "Built-in alternative: Leads (CRM) section with CSV import/export"],
    setupSteps: [
      "Nothing to configure yet. Implementation requires a HubSpot private-app token or OAuth app plus field mapping decisions.",
    ],
    troubleshooting: ["Any 'connected' claim for a CRM would be fabricated — report it as a bug."],
    notImplementedNote: "Not implemented yet: no CRM adapter exists in the codebase.",
    verifySupported: false,
  },
  {
    id: "email-verification",
    name: "Email Verification",
    category: "Outreach & email",
    tagline: "Third-party email-address verification for lead lists — not implemented yet.",
    description:
      "No email-verification provider (e.g. a mailbox-existence checker) is integrated: there is no adapter and no env configuration. Today the CSV importer validates address FORMAT and duplicates only — it does not claim deliverability. A verification adapter would plug into the import pipeline once a provider is chosen.",
    docsUrl: null,
    kind: "info",
    envVars: [],
    capabilities: ["Not implemented — format validation only (CSV import)", "No deliverability claims are made anywhere in the product"],
    setupSteps: [
      "Nothing to configure yet. Pick a verification provider, then implement its adapter (API key, server-only) following src/lib/email patterns.",
    ],
    troubleshooting: ["Leads are never labelled 'verified' by the current system — only format-checked."],
    notImplementedNote: "Not implemented yet: no email-verification provider adapter exists in the codebase.",
    verifySupported: false,
  },
];

export function getIntegrationDescriptor(id: string): IntegrationDescriptor | null {
  return INTEGRATION_REGISTRY.find((d) => d.id === id) ?? null;
}

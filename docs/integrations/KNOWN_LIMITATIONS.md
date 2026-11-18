# Known Limitations

Everything in this ecosystem that does not work yet, stated plainly.
Read this before promising anything to a user, a platform, or a
customer. Each item names where it lives in the code so it can be
verified and, eventually, fixed.

## 1. Nothing is live-verified

- No provider has been authenticated against its real API. Every live
  grant flow needs the owner to apply migrations 022–031, 036, 038
  (032–035 and 037 do not exist) and set `TOKEN_ENCRYPTION_KEY` in
  Vercel.
- No platform submission or publication is claimed: not Meta (Muse),
  not OpenAI (ChatGPT), not Anthropic (Claude), not Zapier, not npm /
  n8n (community node), not Make, Pabbly, Albato, or Activepieces.
- The only live checks ever performed were read-only HTTP checks of
  NxtSend's own deployed site — not of any provider.

## 2. Deployment lag (dated 2026-11-18)

- As of 2026-11-18 ~07:25 +06 the live site still served the pre-n8n
  build (homepage build ID `SRCeQ_zoG-67TWwPomTCn`; n8n
  health/metadata/auth-test all 404). A fresh-clone `next build`
  compiled successfully, so the build does not explain it — the owner
  must check Vercel → Deployments. See [DEPLOYMENT.md](./DEPLOYMENT.md).

## 3. Build process incident (`628a825` / `f8dea22`)

- `628a825` was pushed while `npm run build` was failing, masked by a
  piped `grep` in the verification command (the pipe swallowed the
  non-zero exit code). Fixed in `f8dea22` by making
  `developers/reference.ts` client-safe (limits pinned as literals
  120 / 120 / 3, asserted by test).
- Process lesson, now a rule: verify build exit codes directly, never
  through a pipe.

## 4. LinkedIn — hard limits

- **No LinkedIn-send/accept anywhere.** There is no LinkedIn-send
  action, no connection-request endpoint, and no DM endpoint on any
  platform, MCP server, or REST route. `accepted` stays null.
- There is no `.send` tier on Zapier or n8n scopes.
- The LinkedIn entry in the Integration Center is a documented demo
  only — no vendor adapter exists (`LINKEDIN_PROVIDER` /
  `LINKEDIN_PROVIDER_API_KEY` are reserved names that connect nothing).

## 5. API capability gaps

- `get_date_range_report` returns **501** (`date_range_not_supported`):
  stats loaders compute over all-time records and cannot filter by
  date. Use `get_performance_summary` / `get_campaign_performance`.
- **Campaign launch is dashboard-only.** No REST action, no MCP tool
  launches a campaign.
- **No message-draft endpoint** exists on any surface.
- **`private_key_jwt` client authentication is NOT SUPPORTED.**
- **No persistent idempotency ledger:** a retried `create_campaign`
  may duplicate the campaign. Clients must check for existence before
  re-creating.

## 6. Skipped-lead count is stored but not visible to operators

- Email-outreach adapters compute the skipped count (suppressed +
  no-email + duplicates) and it **is** persisted on the sync job
  (`integration_sync_jobs.skipped_count`, migration 030) and returned
  in the `SyncResult`. But there is **no UI page or API route that
  lists sync jobs**, so an operator cannot see the count without
  querying the database directly. (Correction to the brief for this
  doc set, which said the count was "not surfaced in any sync-job
  result": the result object does carry it — the gap is that no
  surface exposes sync jobs to an operator.)

## 7. Rate limiting and webhook timing

- In-memory rate limiting (120/min per token / per grant) is **not
  shared across Vercel instances** — a token landing on another
  instance gets a fresh budget. It is a brake against runaway loops,
  not a guaranteed quota.
- Webhook retry may wait **up to ~24 hours**: the outbox retries at
  most 3 times (backoff 5m → 30m) and the daily 06:00 cron is the
  other retry path. Delivery is eventually-consistent, not real-time.

## 8. Provider-blocked (cannot be connected)

| Provider | Reason |
| --- | --- |
| Clearbit | Standalone API deprecated after the HubSpot acquisition |
| Trigify | Shut down 22 Oct 2026 |
| Weezly | No public API exists |

## 9. Config-ready stubs (verify before relying on them)

- **Persana** and **Factors.ai** (enrichment) are minimal
  config-ready stubs, not full adapters.
- **Masterinbox**: some endpoints are unverified against the live API.

## 10. Audit and monitoring blind spots

- ChatGPT/Claude tool calls are all recorded as `muse.tool.*`
  (shared MCP adapter) — **no per-client audit split**. The audit log
  cannot attribute calls to ChatGPT vs Claude vs Muse.
- The 60+ config-ready adapters write **no audit rows**. Their API
  counts in admin monitoring show as **null, not zero** — null means
  "no data", not "no usage".

## 11. API keys are n8n-only by backend design

- `resolveRestContext` resolves `nxt_live_` keys only for n8n.
  Extending API keys to any other platform needs a backend change.

## 12. Provider disable flag — partial enforcement

- The admin disable flag (migration 038) is enforced on the **six
  REST automation platforms only** (`resolveRestContext` →
  503 `provider_disabled`). The connect flow for config-ready
  adapters is **not yet gated** — disabling one does not currently
  block storing a credential for it.

## 13. Status service and verification gaps

- The status service has **no per-provider rule for the 60+ new
  adapter ids**: it returns "Unknown integration.", which the display
  layer rewrites. New adapters therefore show a generic status, not a
  real one.
- **No Test Connection button** for new adapters: `verify.ts` has no
  case for any of them. The only verification paths that exist are
  for the pre-existing ids (supabase, resend, gmail, microsoft,
  stripe, openai, anthropic, meta-model, meta-pixel, webhooks, jobs,
  linkedin, muse-ai, chatgpt, claude, zapier, n8n).
- Generic placeholders **`crm`** and **`email-verification`** remain
  as info entries in the Center registry — they are not providers.

## 14. Category J verification gaps

- **HotHawk:** campaign enrolment + campaign creation request bodies
  are unverified (config-ready, no call made).
- **GetLeads:** fair-use response shape unread — credit-balance calls
  return null.
- **Twain:** docs are JavaScript-rendered (unverifiable) — not
  implemented.
- **Loopster:** API base host unverified — not implemented.
- **No Category J operator guides** exist yet under
  `docs/integrations/providers/` (their setup steps reference
  official docs only).

## 15. Muse tool-count discrepancy

- The provider registry says the Muse MCP server exposes **18
  tools**; the code serves the full **54-tool** manifest on
  `/api/mcp` (the Stage 0 audit found no slicing in
  `adapter.listTools()`). The registry text is stale. Any submission
  or scope work for Muse must account for the extra 36 tools already
  being served.

## 16. Other

- `conversation.created` is **not** a webhook event — conversations
  are polling-only (`GET /v1/conversations`).
- Google Sheets/Drive/Calendar adapters now request their scopes via
  `GOOGLE_SCOPES`; stored Gmail-only grants must re-connect.
- ChatGPT Apps SDK widget render is still pending; Claude's
  `claude.com` callback URI was not confirmed in the official doc
  fetched 2026-11-16 (see [OAUTH_SETUP.md](./OAUTH_SETUP.md)).
- The Make app manifest + scenario blueprints and the Activepieces
  piece exist, but neither is submitted to its platform.

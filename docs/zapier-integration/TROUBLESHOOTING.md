# Zapier Integration — Troubleshooting

## Status problems (Integration Center)

| Symptom | Meaning / fix |
|---|---|
| Status "Demo Mode" | The app runs without Supabase. The Zapier surface refuses demo outright (API 503). Configure Supabase, then check again in live mode. |
| Status "Not Connected" | `ZAPIER_ENABLED` is false. Remove it / set it to `"true"` and redeploy. |
| Status "Configuration Required" | Enabled but no public URL is set (`ZAPIER_APP_BASE_URL` or `NEXT_PUBLIC_APP_URL`). Set one and redeploy. |
| Status "Connected but Not Verified" | Configured, but no active Zapier grant exists yet. Configuration alone is never a connection — connect from Zapier (steps on the detail page) to create a grant. |
| Status stays "Connected but Not Verified" after connecting in Zapier | The grant was issued for another platform's resource, or the grant count query cannot read the OAuth tables (migration 023 not applied → count is null, treated as unknown, never as zero). Check the grants panel on the detail page and the admin Zapier panel. |

## Auth / API errors

| Symptom | Meaning / fix |
|---|---|
| Authorize returns 503 | `TOKEN_ENCRYPTION_KEY` is missing or malformed — the authorize-state token cannot be signed. Set it (base64 of 32 bytes) and redeploy. |
| Zapier API calls return 401 | The access token is unknown, expired, revoked, bound to another platform's resource (RFC 8707), or the app is in Demo Mode. Reconnect from Zapier. |
| Zapier API calls return 403 | The token's scopes do not cover the call (`zapier.read` for GETs, `zapier.write` for mutations). Reconnect with the wider scope. |
| Zapier API calls return 429 | Rate limit: 120 req/min per token (in-memory, per-process). Back off and retry; the limit is not a distributed quota. |
| Zapier API calls return 503 "Zapier is not available in Demo Mode…" | Demo Mode refuses all Zapier tokens by design. |
| OAuth redirect mismatch in Zapier | The redirect URI in the Zapier app settings does not exactly match the one registered by DCR. Copy the exact URL from the Zapier dashboard (`https://zapier.com/dashboard/auth/oauth/return/App<digits>CLIAPI/`) and re-register if the App ID changed after publish/beta. |
| LinkedIn replies refused 422 | By design — no authorized LinkedIn provider exists. Email replies work; LinkedIn steps are never sent. |
| Campaign create fails / campaign cannot be launched from Zapier | Create Campaign is draft-only by design (no server-side wizard launch validation exists to reuse). Launch from the dashboard, then pause/resume from Zapier. |
| Pause/resume/stop/archive returns 400 | Transition rule: pause needs active, resume needs paused, stop/archive refuse already-archived. The error message names the current status. |
| Duplicate draft campaign after a retry | Create Campaign has no natural dedup key — a retried create can duplicate a draft. Deduplicate in the Zap or delete the duplicate in the dashboard. |
| `accepted` is always null in performance | No data source exists for LinkedIn accepts — never fabricated. |

## Webhook problems

| Symptom | Meaning / fix |
|---|---|
| Instant trigger never fires | Check the subscription exists (admin Zapier panel → Active webhook subscriptions) and the Zap is on. `conversation.reply_created` fires only for dashboard + Zapier replies — MCP-tool and scheduled-reply sends do not emit yet. |
| Deliveries are late | The immediate attempt is best-effort; failed deliveries retry on the **daily 06:00 cron** (5m → 30m backoff, max 3 attempts, then dead) — a failed delivery may wait up to ~24h for its next retry. Check Zapier Task History and the admin Zapier panel (Recent failed / dead deliveries) for the last error. |
| Deliveries show `dead` | Retries exhausted (3 attempts). Inspect the last error in the admin panel; fix the cause (usually the Zap was deleted or the hook URL is wrong), then re-trigger the event — dead deliveries are kept for inspection, not auto-retried. |
| Subscription deactivated after a 410 | Zapier returned 410 — the Zap is gone. Re-enable the Zap in Zapier; a new subscription is created on the next trigger setup. |
| Signature verification fails in a custom receiver | The scheme is `X-NxtSend-Signature: t=<ts>,v1=<hex>` + `X-NxtSend-Timestamp` (HMAC-SHA256, 5-min tolerance). Note: Zapier itself does **not** document verifying these headers — do not expect Zapier's Catch Hook to check them. |
| Subscribe fails | The target URL must be https on `hooks.zapier.com` or `zapier.com`. Any other host is refused. |

## CLI problems

| Symptom | Meaning / fix |
|---|---|
| `zapier-platform validate` fails | Fix the reported errors before pushing — they block `push`. (Current state: exit 0, 27 checks passed, 1 general warning D027 — core 19.3.0, intentionally not upgraded.) |
| `zapier-platform build` hits EMFILE | The sandbox / machine open-file limit is too low (4096 here). Use `zapier-platform build --skip-dep-install`. |
| `register` / `push` / `promote` fail | They need the owner's Zapier developer account + the DCR-registered client. See [ZAPIER_SETUP.md](ZAPIER_SETUP.md). Never commit `.zapierapprc`. |

## Known gaps (not bugs — PENDING follow-ups)

1. **MCP-tool mutations and scheduled-reply sends do not emit
   webhooks yet** (no seam was added to the shared MCP adapter by
   design).
2. **`GET /v1/usage` response shape was not mapped to an output**
   (no trigger/action uses it).

## Fixed after the first draft (coordinator pass)

- **Session-authenticated subscriptions/deliveries endpoint** —
  `GET /api/integrations/zapier/subscriptions` (session auth via
  `resolveCenterContext`, service-role reads, secrets and payloads
  never selected). The Zapier detail page lists live subscriptions
  and the 20 most recent deliveries.
- **Zapier-aware activity source** — `GET /api/muse/activity?platform=zapier`
  returns only `zapier.*` audit rows; the Zapier detail page renders
  them in its activity history section (default filter unchanged:
  `muse.%` / `MUSE_OAUTH%` for the MCP panels).

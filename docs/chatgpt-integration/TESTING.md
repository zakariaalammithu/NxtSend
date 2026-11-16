# Testing

## How to run

```bash
npm test            # full suite (vitest)
npm run build       # production build (must pass with zero errors)
npx tsc --noEmit    # typecheck
npm run config:check -- --live   # env catalogue check (values never printed)
```

Retry a flaky step once before reporting it as a failure.

## Test inventory (ChatGPT surface)

| File | Tests | Covers |
|---|---|---|
| `src/lib/muse-connector/__tests__/chatgpt-oauth.test.ts` | 43 | OAuth: scopes/aliases/tier independence, CIMD validation + fetch (timeout/size/cache), DCR fallback, `private_key_jwt` handling, RFC 8707 resource validation + defaults, RFC 9207 `iss`, redirect allowlist, consent platform labelling |
| `src/lib/muse-connector/__tests__/chatgpt.test.ts` | 15 | MCP flavor: discovery without token (initialize/tools/list/resources/list), 401 + `WWW-Authenticate` on tool calls without token, missing-scope reconnect prompt, demo-mode 503, `structuredContent` on results, annotations |
| `src/lib/muse-connector/__tests__/new-tools.test.ts` | 36 | The 36 new tools: manifest counts/classifications, adapter behaviour incl. `get_date_range_report` BLOCKED, `get_profile`, `search`/`fetch`, `render_campaigns_widget` metadata |
| `src/lib/muse-connector/__tests__/widget.test.ts` | 3 | Widget resource: mime type, `_meta.ui.prefersBorder`, bridge fallback, campaign-card markup |
| `src/app/api/mcp/chatgpt/__tests__/route.test.ts` | 6 | HTTP-level: demo 503, live tools/list (54 tools, `Requires OAuth`), initialize with instructions, tool call 401, resources/read 401 |
| `src/lib/muse-connector/__tests__/chatgpt-config.test.ts` | 8 | `isChatGptMcpEnabled` / `getChatGptPublicUrl` precedence (ChatGPT var wins, else MUSE_* var, else default/app URL/request origin) |
| `src/lib/muse-connector/__tests__/grants.test.ts` (by-origin block) | 5 | `grantOriginForClient` (redirect URIs + CIMD URL origin), `summarizeGrantsByOrigin` (distinct pairs, expired/revoked/access ignored, scope-prefix fallback) |
| `src/lib/integrations-center/__tests__/center.test.ts` (chatgpt block) | 6 | Registry entry (kind/env vars/no client secret/not-submitted copy), status branches (Demo / grant → Connected and Verified / enabled-no-grant → Connected but Not Verified / disabled → Not Connected / Muse grant does not connect ChatGPT), verify outcomes (demo + configured + disabled, no outbound call), `SCOPE_DESCRIPTIONS` covering all six scopes |

Full suite count: see the final report (`NxtSend_ChatGPT_Integration_Final_Report.md`)
for the exact passing total from the final `npm test` run — the table
above is the per-file inventory, not a substitute for the run.

## What is verified vs PENDING

### Verified (unit + build, this environment)

- All of the above, plus the full Muse suite (`muse-oauth`, `mcp`,
  `adapter`, `grants`) still passing — the original 18 tools and their
  classifications are untouched.
- TypeScript clean (`tsc --noEmit`), production build green.
- Registry ↔ `.env.example` parity and config-catalogue parity tests
  pass with the two new `CHATGPT_*` variables.

### Verified live from a primary source (web, 2026-11-16)

- **Apps SDK custom-UX pattern** — live from
  https://developers.openai.com/apps-sdk/build/custom-ux:
  `_meta.ui.resourceUri` + `_meta["openai/outputTemplate"]`, decoupled
  data/render tools, `ui/*` bridge over postMessage, `window.openai`
  compatibility aliases, tools useful without UI. The widget implements
  exactly this pattern.

### NOT verified live (implementation guides / secondary sources only)

- The OpenAI **submission process, review criteria, timeline and fees**:
  no primary OpenAI source for these was verified during this work, so
  APP_SUBMISSION.md claims none of them. Re-check live before
  submitting.
- ChatGPT **plan availability** for Developer Mode / custom connectors:
  Business/Enterprise/Edu is the documented path; reports of free
  personal accounts working are unverified reports, labelled as such.
  Availability changes often — re-check live.

### PENDING (needs the deployed site + a real ChatGPT account)

- Full OAuth grant flow inside ChatGPT (connect → consent → token →
  tool call → revoke).
- Widget render inside a live ChatGPT client.
- Live `tools/list` (54 tools) and `get_profile` from ChatGPT.
- No live ChatGPT connect attempt was possible from this environment
  (no live browser / ChatGPT session here). These are **not** claimed
  as PASS anywhere; they are listed as PENDING in the final report.

## Manual smoke checks (after deploy)

1. `GET https://nxtsend.com/api/mcp/health` → `toolCount: 54`.
2. `GET https://nxtsend.com/.well-known/oauth-authorization-server` →
   200, `token_endpoint_auth_methods` contains `none`, does **not**
   contain `private_key_jwt`.
3. `GET https://nxtsend.com/.well-known/oauth-protected-resource` →
   200, lists both MCP resources.
4. Integration Center → ChatGPT → status "Connected but Not Verified"
   (no grant yet), Test Connection explains there is no safe
   read-only verification call.
5. Connect from ChatGPT Developer Mode with `nxtsend.read`; confirm
   the grants panel lists the grant with scope descriptions; call
   `list_campaigns`; revoke and confirm calls then 401.

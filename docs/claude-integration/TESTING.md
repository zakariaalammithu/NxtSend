# Testing

## Results (own runs, this session)

- `npm test`: **1,477 tests passing, 0 failing, 125 files** (run
  2026-11-17 ~00:19 Dhaka). Baseline at the base commit (66ddb78)
  was 1,405 tests / 120 files; this work adds **72 tests in 5 new
  test files** plus 4 in extended existing files (see inventory).
- Targeted re-run of 10 connector/integration test files:
  **183 passing** — `claude-config` (8), `claude-oauth` (33),
  `claude` (22), Claude metadata route (1), `grants` (13),
  `center` (46), `chatgpt-oauth` (43), `chatgpt` (15), and the Muse
  + ChatGPT metadata route tests (1 each). The 5th new Claude file,
  the Claude MCP route test (4 tests), was covered by the full-suite
  run, not this targeted run.
- `npm run build`: **green** (run 2026-11-17 after `rm -rf .next`;
  `/api/mcp/claude` and the Claude protected-resource metadata route
  are in the compiled route table). One transient failure was seen
  earlier on a stale `.next` directory (ENOENT renaming
  `.next/export/500.html`) — fixed by the `rm -rf .next` retry; not
  a code issue.
- `npx tsc --noEmit`: **clean** (one TS2802 error was found in
  `claude.test.ts(206,16)` during the docs pass — spreading a
  `MapIterator` (`[...byName.keys()]`) — and fixed afterwards with
  `Array.from(byName.keys())`; re-run clean).
- `npm run config:check`: lists `CLAUDE_MCP_ENABLED` /
  `CLAUDE_MCP_PUBLIC_URL` (MISSING in this dev env, as expected —
  they are optional and unset here).

## Test inventory (Claude work)

New files (68 tests):

| File | Tests | Covers |
|---|---|---|
| `src/lib/muse-connector/__tests__/claude-config.test.ts` | 8 | `isClaudeMcpEnabled` / `getClaudePublicUrl` precedence (Claude var wins, else MUSE_* var, else `NEXT_PUBLIC_APP_URL`, else request origin); off-spellings; bad URL → null, never a throw. |
| `src/lib/muse-connector/__tests__/claude-oauth.test.ts` | 33 | `claude.*` scopes + tiers (same tiers as `muse.*`; `send` never implies `read`/`write`); both Claude redirect URIs; platform-bound redirect validation (a Muse client cannot use a Claude callback and vice versa); CIMD clients incl. Claude Code's published document (host-based platform detection, loopback-only redirects); RFC 8707 `resource` binding for `/api/mcp/claude` (byte-for-byte, `invalid_target` on mismatch, other platforms' resources refused); RFC 9207 `iss`; discovery metadata routes incl. the `client_id_metadata_document_supported: true` flag. All through the in-memory store seam — no database; CIMD fetches stubbed, cache cleared between tests. |
| `src/lib/muse-connector/__tests__/claude.test.ts` | 22 | `handleMcpRequest` with flavor `"claude"`: `tools/list` without a token → 401 with `WWW-Authenticate` naming the Claude protected-resource metadata (unlike ChatGPT's pre-auth list); `initialize` without a token → 401; `initialize` with a token returns Claude instructions + `{tools, prompts, resources}` capabilities; tool call with a valid token works; insufficient scope → Muse-style structured `missing_scope` error (NOT the ChatGPT reconnect prompt); `structuredContent` present on tool results; annotations correct on every tool (incl. the `get_conversation` exception and the 4 destructive tools); `prompts/list` + `prompts/get` (valid/invalid args); `resources/list` + `resources/read` auth behaviour incl. the `nxtsend://account` resource; user isolation; rate limit; demo mode → 503 with the "Claude MCP" message. Muse and ChatGPT flavors keep their exact prior behaviour. |
| `src/app/api/mcp/claude/__tests__/route.test.ts` | 4 | HTTP-level behaviour of `/api/mcp/claude`: demo mode → 503 `not_configured` with the "Claude MCP" message; live mode without a token → 401 with `WWW-Authenticate` naming the Claude resource; `GET` → 405. |
| `src/app/.well-known/oauth-protected-resource/api/mcp/claude/__tests__/route.test.ts` | 1 | The path-scoped metadata document names the Claude resource, the single authorization server, all issued scopes (incl. `claude.read`), header bearer. |

Extended existing files (+4 tests):

| File | Change |
|---|---|
| `src/lib/muse-connector/__tests__/grants.test.ts` | +1 (13 total): Claude origin classification (CIMD host, Claude redirect URI, `claude.*` scope fallback) in `grantsByOrigin`. |
| `src/lib/integrations-center/__tests__/center.test.ts` | +3 (46 total): `claude` status branches (Demo → Demo Mode; real grant → Connected and Verified; enabled without grant → Connected but Not Verified; Muse/ChatGPT grants never connect it), registry entry, verify outcomes. |
| `src/app/.well-known/oauth-protected-resource/api/mcp/__tests__/route.test.ts` + `.../chatgpt/__tests__/route.test.ts` | 0 new tests; expectations updated for the 9-scope set (the root document now covers three resources). |
| `src/lib/muse-connector/__tests__/chatgpt-oauth.test.ts`, `chatgpt.test.ts` | 0 new tests; small updates so the ChatGPT flows keep passing with the shared code changes. |

## How to run

```bash
npm test            # full suite (1,477 tests, ~80 s)
npx vitest run src/lib/muse-connector/__tests__/claude.test.ts \
  src/lib/muse-connector/__tests__/claude-oauth.test.ts \
  src/lib/muse-connector/__tests__/claude-config.test.ts \
  src/app/api/mcp/claude/__tests__/route.test.ts \
  src/app/.well-known/oauth-protected-resource/api/mcp/claude/__tests__/route.test.ts
npm run build       # production build (rm -rf .next first if a stale .next dir errors)
npx tsc --noEmit    # type check
npm run config:check # env-var catalogue check
```

## What is verified vs pending

- **Verified by tests:** everything in the inventory above — the
  OAuth extensions, the Claude MCP behaviour (auth, prompts,
  resources, rate limit, demo mode, missing-scope shape), the
  config precedence, the grants-by-origin split, the Integration
  Center status/verify branches, the metadata routes.
- **Verified by reading the code:** the tool manifest counts (36/14/4),
  the consent screen contents, the admin overview fields, the
  `claude-mcp` health check, the env-var catalogue entries.
- **PENDING (not verifiable from this environment):** the full OAuth
  grant flow inside a live Claude client; the prompts surfacing in
  Claude; the `nxtsend://account` resource read from Claude; the
  campaigns widget rendered inside Claude; the live metadata and
  health endpoints on the deployed site; plan availability against a
  real Claude account. None of these is claimed as passing anywhere
  in these docs or the final report.
- **Not tested live:** the `claude.com` redirect variant (see the
  caveat in README.md / OAUTH_SETUP.md) — it is allowlisted but was
  never observed in a real Claude callback.

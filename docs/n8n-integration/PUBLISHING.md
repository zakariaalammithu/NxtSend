# Publishing — NxtSend × n8n

**Status: NOT published, NOT verified.** The
`n8n-nodes-nxtsend` package has not been published on npm and
n8n has not verified anything. Nothing below has been submitted
to npm or to n8n. This page documents what publication and
verification require, and the exact owner steps — so the work
can be done once, correctly.

## npm package metadata (verified from the package — 2026-11-18)

Read from `integrations/n8n-nodes-nxtsend/package.json`:

| Field | Value |
|---|---|
| Name | `n8n-nodes-nxtsend` |
| Version | `0.1.0` |
| Description | "NxtSend — LinkedIn outreach automation for n8n" |
| License | MIT |
| Keywords | `n8n-community-node-package`, `n8n`, `nxtsend`, `linkedin`, `outreach`, `leads`, `campaigns`, `sales` |
| Node | `>=20` |
| `n8n` field | `n8nNodesApiVersion: 1`, `strict: true`; credentials `dist/credentials/NxtSendApi.credentials.js` + `dist/credentials/NxtSendOAuth2Api.credentials.js`; nodes `dist/nodes/NxtSend/NxtSend.node.js` + `dist/nodes/NxtSendTrigger/NxtSendTrigger.node.js` |
| Scripts | `build: n8n-node build`, `lint: n8n-node lint`, `test: jest`, `release: n8n-node release`, `prepublishOnly: n8n-node prerelease` |
| Dev deps | `@n8n/node-cli 0.57.3`, `typescript 5.9.2`, `jest 29.7.0`, `n8n-workflow 2.48.2`, `release-it 21.1.0`, `eslint 9.32.0`, `prettier 3.6.2` |

**Build status (coordinator pass 2026-11-18, ~19:07 +06):
`npm run build` PASSES** ("Build successful") and
**`npm test` PASSES 126/126** (5 suites, ~14s). The package was
still failing earlier the same day (missing Trigger node file,
type errors, `jest: not found`) and Worker C fixed all of it
during the day — the numbers above are the current state, not
the morning's. The package is therefore publishable from a
build/test standpoint; what remains is npm publication + n8n
verification (owner steps below), and the live load test in a
real n8n instance (still PENDING — no Docker here).

## Name availability

Checked **2026-11-18** (live, `npm view n8n-nodes-nxtsend`):

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/n8n-nodes-nxtsend - Not found
```

The name **`n8n-nodes-nxtsend` is available on npm** — nothing
is published under it. (Availability is not a reservation: the
name can be taken by anyone until the owner publishes it. The
earlier check on 2026-11-17, recorded in the task brief, found
the same result.) Re-check immediately before publishing.

## Publishing to npm (owner steps)

The owner (or a maintainer with npm publish rights for the
`n8n-nodes-nxtsend` scope) runs these — they are **not** done by
this codebase and have **not** been done:

1. `npm login` as the publishing account (npm account with 2FA
   — use a granular access token, not a password in CI, if
   automating).
2. From `integrations/n8n-nodes-nxtsend/`:
   `npm run build` (must pass — the package is TypeScript) and
   `npm test` (must pass — get the real numbers from Worker C's
   report).
3. `npm publish --access public` (scoped packages default to
   restricted; a community node must be public).
4. Verify: `npm view n8n-nodes-nxtsend version` returns `0.1.0`.
5. Tag the release in the NxtSend repo (e.g.
   `n8n-nodes-nxtsend-v0.1.0`) so the published code matches a
   commit.

## n8n community-node verification (owner steps)

n8n verifies community nodes separately from npm publication.
The process (per n8n's community-node documentation — verify
the current requirements on n8n's site before submitting, as
they change):

1. Publish the package on npm first (above).
2. Submit the package for verification through n8n's
   community-node verification form/submission flow, with:
   - the npm package URL,
   - a description of what the nodes do,
   - a test n8n instance or credentials demonstrating the nodes
     working against a live NxtSend deployment (n8n reviews
     functionality, not just metadata).
3. n8n reviews the submission. Until approval, the node is
   installable by name (after npm publish) but is **not**
   marked verified in n8n's directory.
4. After approval, the node appears as verified. The Integration
   Center copy, this doc, and the final report must then be
   updated to say so — **do not update them before approval
   arrives**.

## What "verified" does and does not mean

- Verified means n8n reviewed the package and lists it as a
  verified community node. It does **not** mean n8n endorses
  NxtSend, and it does **not** change the LinkedIn boundary:
  LinkedIn sending stays unsupported regardless of verification.
- Verification is per package version in practice — a new major
  version should be re-submitted if n8n asks for it.

## Until publication

- **Until publication:** install from the repo path
  (`integrations/n8n-nodes-nxtsend/`) — see
  [N8N_SETUP.md](N8N_SETUP.md). The package builds and its
  tests pass (126/126); the local-install steps are the
  package's own README/AGENTS.md (`n8n-node` CLI for build/dev/
  lint; `package.json` `n8n` field points at `dist/`).
- The Integration Center entry, the settings page, and the admin
  panel all state "Not published on npm / not verified by n8n"
  until both steps above are complete and confirmed.
